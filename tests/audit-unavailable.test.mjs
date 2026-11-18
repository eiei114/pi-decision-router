import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAuditEvent, readAuditTail } from "../lib/audit.ts";
import { DecisionRouter } from "../lib/router.ts";

async function makeTempDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "pi-decision-router-audit-unavailable-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

function makeAuditEvent(toolName = "decision_request") {
  return {
    timestamp: "2026-11-18T00:00:00.000Z",
    cwd: "/temporary/test",
    toolName,
    questions: [],
    answers: [],
    child: { attempted: false, status: "disabled" },
  };
}

test("appendAuditEvent recovers its queue after an unusable path", async (t) => {
  const directory = await makeTempDirectory(t);
  const unusablePath = join(directory, "audit-directory");
  await mkdir(unusablePath);

  await assert.rejects(appendAuditEvent(unusablePath, makeAuditEvent("failed")));

  const validPath = join(directory, "audit.jsonl");
  const event = makeAuditEvent("recovered");
  await appendAuditEvent(validPath, event);
  assert.deepEqual(JSON.parse(await readFile(validPath, "utf8")), event);
});

test("readAuditTail fails open and keeps only the newest requested lines", async (t) => {
  const directory = await makeTempDirectory(t);
  const missingPath = join(directory, "missing.jsonl");
  assert.deepEqual(await readAuditTail(missingPath), []);
  assert.deepEqual(await readAuditTail(directory), []);

  const validPath = join(directory, "audit.jsonl");
  await writeFile(validPath, "oldest\nmiddle\nnewest\n", "utf8");
  assert.deepEqual(await readAuditTail(validPath, 2), ["middle", "newest"]);
});

test("DecisionRouter returns the same answers when its audit path is unavailable", async (t) => {
  const directory = await makeTempDirectory(t);
  const unusablePath = join(directory, "audit-directory");
  await mkdir(unusablePath);

  const request = {
    toolName: "decision_request",
    cwd: directory,
    context: "test context",
    questions: [{
      id: "scope",
      prompt: "Choose a scope",
      options: [{ value: "small", label: "Small" }, { value: "large", label: "Large" }],
      allowOther: false,
      multiSelect: false,
    }],
  };
  const runChild = async (_config, childRequest) => ({
    answers: childRequest.questions.map((question) => ({
      id: question.id,
      value: "small",
      label: "Small",
      reason: "Keep the first slice small.",
      confidence: 0.9,
      source: "child-agent",
    })),
    plan: { command: "test-child", argsPrefix: [], shell: false, source: "test" },
  });
  const makeRouter = (auditLogPath) => new DecisionRouter({
    config: {
      enabled: true,
      childEnabled: true,
      autoCompactionEnabled: true,
      autoCompactionThresholdPercent: 95,
      autoCompactionEmergencyPercent: 100,
      timeoutMs: 1000,
      auditLogPath,
      maxContextChars: 1000,
    },
    runChild,
  });

  const unavailableResult = await makeRouter(unusablePath).decide(request);
  const writableResult = await makeRouter(join(directory, "writable-audit.jsonl")).decide(request);

  assert.deepEqual(unavailableResult.answers, writableResult.answers);
  assert.equal(unavailableResult.answers.length, 1);
  assert.equal(unavailableResult.answers[0].value, "small");
  assert.equal(unavailableResult.child.status, "selected");
  assert.equal(JSON.parse(await readFile(join(directory, "writable-audit.jsonl"), "utf8")).answers[0].value, "small");
});
