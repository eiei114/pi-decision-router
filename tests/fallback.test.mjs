import test from "node:test";
import assert from "node:assert/strict";
import { chooseFallback } from "../lib/fallback.ts";

test("fallback prefers recommended option", () => {
  const answer = chooseFallback({
    id: "scope",
    prompt: "Choose scope",
    options: [
      { value: "full", label: "Full" },
      { value: "mvp", label: "MVP (Recommended)" },
    ],
    allowOther: false,
    multiSelect: false,
  });

  assert.equal(answer.value, "mvp");
  assert.equal(answer.source, "fallback");
});

test("open confirmation falls back to yes", () => {
  const answer = chooseFallback({
    id: "publish",
    prompt: "Do you want to publish this release?",
    options: [],
    allowOther: true,
    multiSelect: false,
  });

  assert.equal(answer.value, "yes");
});
