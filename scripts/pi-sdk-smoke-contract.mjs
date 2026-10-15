export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_NAMES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];
export const EXPECTED_SDK_VERSIONS = Object.fromEntries(SDK_NAMES.map((name) => [name, "1.2.0"]));
export const LOAD_PREFIX = "PI_DECISION_ROUTER_SMOKE_LOAD:";
export const RESULT_PREFIX = "PI_DECISION_ROUTER_SMOKE_RESULT:";
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function hasExtensionLoadError(responses, output) {
  return responses.some((row) => row?.type === "extension_error") || EXTENSION_LOAD_ERROR_PATTERN.test(output);
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function statusRecord(responses) {
  return responses.find((row) => row?.type === "extension_ui_request"
    && row.method === "setStatus" && row.statusKey === "pi-decision-router"
    && typeof row.statusText === "string" && row.statusText.includes("Decision Router: [ON]"));
}

function markedPayload(responses, prefix) {
  const row = responses.find((item) => item?.type === "extension_ui_request"
    && item.method === "notify" && typeof item.message === "string" && item.message.startsWith(prefix));
  if (!row) return undefined;
  try { return JSON.parse(row.message.slice(prefix.length)); } catch { return undefined; }
}

function featureObservation(responses) {
  const prompt = responses.find((row) => row?.type === "response" && row.command === "prompt");
  const payload = markedPayload(responses, RESULT_PREFIX);
  const answer = payload?.result?.answers?.[0];
  const auditedAnswer = payload?.audit?.answers?.[0];
  const passed = prompt?.success === true && prompt.data?.disposition === "handled"
    && payload?.result?.cancelled === false && answer?.answer === "Minimal (Recommended)"
    && auditedAnswer?.source === "fallback" && payload?.audit?.toolName === "rpiv:ask-user:prompt";
  return { prompt: prompt ?? null, payload: payload ?? null, passed };
}

export function behaviorAssertions(name, {
  responses = [],
  fullOutput = "",
  exit_code = 1,
  process_exit_codes = [exit_code],
  expectedVersion = "1.2.0",
}) {
  if (name === "extension_load") {
    const status = statusRecord(responses);
    const registration = markedPayload(responses, LOAD_PREFIX);
    const registered = Array.isArray(registration?.toolNames) && registration.toolNames.includes("decision_request");
    return [assertion("extension_registered",
      "Actual Pi starts the package extension, emits its enabled status, and exposes decision_request",
      { status: status ?? null, toolNames: registration?.toolNames ?? null }, Boolean(status) && registered)];
  }

  if (name === "happy_path") {
    const feature = featureObservation(responses);
    return [assertion("feature_response",
      "The actual Pi RPC command traverses the router event adapter and returns its deterministic recommended answer",
      { prompt: feature.prompt, result: feature.passed }, feature.passed)];
  }

  if (name === "error_path") {
    const feature = featureObservation(responses);
    const audit = markedPayload(responses, RESULT_PREFIX)?.audit;
    const handledChildFailure = audit?.child?.attempted === true && audit.child.status === "fallback"
      && typeof audit.child.error === "string" && audit.child.error.length > 0;
    return [assertion("handled_error",
      "A failed child Pi launch is captured by the router and returns its fallback answer without an unhandled host error",
      { featureResponse: feature.passed, child: audit?.child ?? null, unhandled: UNHANDLED_ERROR_PATTERN.test(fullOutput) },
      feature.passed && handledChildFailure && !UNHANDLED_ERROR_PATTERN.test(fullOutput))];
  }

  if (name === "reload_cleanup") {
    const status = statusRecord(responses);
    const feature = featureObservation(responses);
    const clean = process_exit_codes.length >= 2 && process_exit_codes.every((code) => code === 0)
      && !UNHANDLED_ERROR_PATTERN.test(fullOutput);
    return [
      assertion("reloaded_extension_registered",
        "The second actual Pi process emits the package's enabled extension status",
        status ?? null, Boolean(status)),
      assertion("reloaded_feature_response",
        "The second process handles the real router event and returns the expected audited answer",
        { prompt: feature.prompt, result: feature.passed }, feature.passed),
      assertion("clean_shutdown",
        "Both actual Pi processes exit zero and captured output contains no unhandled or shutdown error",
        { process_exit_codes, unhandled: UNHANDLED_ERROR_PATTERN.test(fullOutput) }, clean),
    ];
  }

  if (name === "host_shell") {
    const observed = fullOutput.trim();
    return [assertion("native_shell_boundary",
      "The native host shell launches this checkout's pinned Pi CLI and returns its exact version",
      { exit_code, output: observed, expectedVersion }, exit_code === 0 && observed === expectedVersion)];
  }

  throw new Error(`Unknown smoke case: ${name}`);
}
