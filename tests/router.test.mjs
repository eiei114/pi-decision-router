import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecisionRouter } from "../lib/router.ts";

test("router uses injected child answers and writes audit JSONL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-decision-router-"));
  const auditLogPath = join(directory, "audit.jsonl");
  const router = new DecisionRouter({
    config: {
      enabled: true,
      childEnabled: true,
      timeoutMs: 1000,
      auditLogPath,
      maxContextChars: 1000,
    },
    runChild: async (_config, request) => ({
      answers: [{
        id: request.questions[0].id,
        value: "mvp",
        label: "MVP",
        reason: "Keep the first slice small.",
        confidence: 0.9,
        source: "child-agent",
      }],
      plan: { command: "test-pi", argsPrefix: [], shell: false, source: "test" },
      model: "test-model",
    }),
  });

  const result = await router.decide({
    toolName: "decision_request",
    cwd: directory,
    context: "test context",
    questions: [{
      id: "scope",
      prompt: "Choose scope",
      options: [{ value: "mvp", label: "MVP" }, { value: "full", label: "Full" }],
      allowOther: false,
      multiSelect: false,
    }],
  });

  assert.equal(result.answers[0].value, "mvp");
  const audit = await readFile(auditLogPath, "utf8");
  assert.equal(JSON.parse(audit).toolName, "decision_request");
});
