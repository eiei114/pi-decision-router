import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions,
  EXPECTED_SDK_VERSIONS,
  hasExtensionLoadError,
  LOAD_PREFIX,
  parseJsonLines,
  RESULT_PREFIX,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const status = { type: "extension_ui_request", method: "setStatus", statusKey: "pi-decision-router",
  statusText: "Decision Router: [ON] | Enter /decision-router-toggle to switch" };
const toolRegistration = { type: "extension_ui_request", method: "notify",
  message: `${LOAD_PREFIX}${JSON.stringify({ toolNames: ["decision_request"] })}` };
const prompt = { type: "response", command: "prompt", success: true, data: { disposition: "handled" } };
const payload = {
  result: { cancelled: false, answers: [{ kind: "option", answer: "Minimal (Recommended)" }] },
  audit: { toolName: "rpiv:ask-user:prompt", answers: [{ source: "fallback" }],
    child: { attempted: false, status: "fallback", error: "child agent disabled" } },
};
const feature = { type: "extension_ui_request", method: "notify", message: `${RESULT_PREFIX}${JSON.stringify(payload)}` };
const observed = (responses = [status, toolRegistration, prompt, feature], fullOutput = "", exit_code = 0,
  process_exit_codes = [exit_code]) => ({ responses, fullOutput, exit_code, process_exit_codes, expectedVersion: "1.2.0" });
const run = (name, options) => behaviorAssertions(name, observed(...options));

test("contract names and JSONL parser are stable", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(EXPECTED_SDK_VERSIONS, {
    "@earendil-works/pi-agent-core": "1.2.0",
    "@earendil-works/pi-ai": "1.2.0",
    "@earendil-works/pi-coding-agent": "1.2.0",
    "@earendil-works/pi-tui": "1.2.0",
  });
  assert.deepEqual(parseJsonLines(`not-json\r\n${JSON.stringify(prompt)}\n\n`), [prompt]);
});

test("extension load requires both actual status and the registered decision tool", () => {
  assert.equal(behaviorAssertions("extension_load", observed())[0].passed, true);
  for (const responses of [[], [status], [toolRegistration], [
    { ...status, statusKey: "other" }, toolRegistration,
  ], [status, { ...toolRegistration, message: `${LOAD_PREFIX}{"toolNames":[]}` }]]) {
    assert.equal(behaviorAssertions("extension_load", observed(responses))[0].passed, false);
  }
});

test("happy path requires a handled Pi command and the audited expected feature response", () => {
  assert.equal(behaviorAssertions("happy_path", observed())[0].passed, true);
  for (const responses of [[], [prompt], [feature], [
    { ...prompt, data: { disposition: "started" } }, feature,
  ], [prompt, { ...feature, message: `${RESULT_PREFIX}{"result":{"cancelled":false}}` }]]) {
    assert.equal(behaviorAssertions("happy_path", observed(responses))[0].passed, false);
  }
});

test("error path proves a failed child launch was handled by deterministic fallback", () => {
  const failedChild = { ...payload, audit: { ...payload.audit,
    child: { attempted: true, status: "fallback", error: "spawn missing-pi ENOENT" } } };
  const responses = [prompt, { ...feature, message: `${RESULT_PREFIX}${JSON.stringify(failedChild)}` }];
  assert.equal(behaviorAssertions("error_path", observed(responses))[0].passed, true);
  for (const child of [
    { attempted: false, status: "fallback", error: "disabled" },
    { attempted: true, status: "error", error: "spawn failed" },
    { attempted: true, status: "fallback", error: "" },
  ]) {
    const bad = { ...failedChild, audit: { ...failedChild.audit, child } };
    assert.equal(behaviorAssertions("error_path", observed([prompt,
      { ...feature, message: `${RESULT_PREFIX}${JSON.stringify(bad)}` }]))[0].passed, false);
  }
});

test("reload requires second-process registration, feature response, and clean exits", () => {
  const assertions = behaviorAssertions("reload_cleanup", observed(undefined, "", 0, [0, 0]));
  assert.deepEqual(assertions.map((item) => item.id), [
    "reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown",
  ]);
  assert.ok(assertions.every((item) => item.passed));
  for (const responses of [[], [prompt, feature], [status], [status, prompt], [status, feature]]) {
    assert.ok(behaviorAssertions("reload_cleanup", observed(responses, "", 0, [0, 0])).some((item) => !item.passed));
  }
  assert.equal(behaviorAssertions("reload_cleanup", observed(undefined, "", 0, [0, 1]))[2].passed, false);
  assert.equal(behaviorAssertions("reload_cleanup", observed(undefined, "shutdown error", 0, [0, 0]))[2].passed, false);
  assert.equal(UNHANDLED_ERROR_PATTERN.test("UnhandledPromiseRejection"), true);
});

test("extension loading errors are detected in RPC records and diagnostics", () => {
  assert.equal(hasExtensionLoadError([], ""), false);
  assert.equal(hasExtensionLoadError([{ type: "extension_error" }], ""), true);
  assert.equal(hasExtensionLoadError([], "Failed to load extension"), true);
});

test("native shell assertion requires the exact version and zero exit", () => {
  assert.equal(behaviorAssertions("host_shell", observed([], "1.2.0\r\n"))[0].passed, true);
  for (const [output, exitCode] of [["", 0], ["11.2.0", 0], ["1.2.0 plus warning", 0], ["1.2.0", 1]]) {
    assert.equal(behaviorAssertions("host_shell", observed([], output, exitCode))[0].passed, false);
  }
});
