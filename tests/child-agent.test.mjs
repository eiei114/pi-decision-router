import test from "node:test";
import assert from "node:assert/strict";
import { parseChildAnswers, resolvePiCommand } from "../lib/child-agent.ts";

const question = {
  id: "scope",
  prompt: "Choose scope",
  options: [{ value: "mvp", label: "MVP" }, { value: "full", label: "Full" }],
  allowOther: false,
  multiSelect: false,
};

test("parses strict child JSON and validates option values", () => {
  const answers = parseChildAnswers(JSON.stringify({
    answers: [{ id: "scope", value: "mvp", label: "MVP", reason: "Smallest useful slice", confidence: 0.9 }],
  }), [question]);

  assert.equal(answers.length, 1);
  assert.equal(answers[0].value, "mvp");
  assert.equal(answers[0].source, "child-agent");
});

test("rejects invalid child option values", () => {
  const answers = parseChildAnswers('{"answers":[{"id":"scope","value":"unknown"}]}', [question]);
  assert.deepEqual(answers, []);
});

test("resolves a safe non-shell fallback command shape", () => {
  const plan = resolvePiCommand("pi");
  assert.equal(plan.command, "pi");
  assert.equal(plan.shell, false);
});
