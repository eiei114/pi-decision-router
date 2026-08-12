import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDecisionInput } from "../lib/normalize.ts";

test("normalizes Claude/gstack-style questions", () => {
  const request = normalizeDecisionInput("AskUserQuestion", {
    questions: [
      {
        header: "Scope",
        question: "Which scope should we ship?",
        options: [
          { label: "MVP", description: "Smallest useful slice" },
          { label: "Full", description: "Everything now" },
        ],
      },
    ],
  }, "/tmp/project", "recent context");

  assert.equal(request.questions.length, 1);
  assert.equal(request.questions[0].prompt, "Which scope should we ship?");
  assert.equal(request.questions[0].options[0].value, "MVP");
  assert.equal(request.questions[0].header, "Scope");
  assert.equal(request.context, "recent context");
});

test("normalizes questionnaire values and multi-select", () => {
  const request = normalizeDecisionInput("questionnaire", {
    multiSelect: true,
    questions: [{
      id: "channels",
      prompt: "Which channels?",
      options: [{ value: "x", label: "X" }, { value: "blog", label: "Blog" }],
    }],
  });

  assert.equal(request.questions[0].id, "channels");
  assert.equal(request.questions[0].multiSelect, true);
  assert.deepEqual(request.questions[0].options.map((option) => option.value), ["x", "blog"]);
});
