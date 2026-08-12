import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../extensions/index.ts";

test("registers only the conflict-free canonical tool", () => {
  const tools = [];
  const pi = {
    registerTool(tool) {
      tools.push(tool.name);
    },
    registerCommand() {},
    on() {},
    appendEntry() {},
    events: { on() { return () => {}; } },
  };

  extension(pi);
  assert.deepEqual(tools, ["decision_request"]);
});

test("routes Pi UI dialogs and rpiv questionnaire events", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-decision-router-extension-"));
  const previousChild = process.env.PI_DECISION_ROUTER_CHILD;
  const previousAudit = process.env.PI_DECISION_ROUTER_AUDIT_LOG;
  process.env.PI_DECISION_ROUTER_CHILD = "0";
  process.env.PI_DECISION_ROUTER_AUDIT_LOG = join(directory, "audit.jsonl");

  try {
    const tools = [];
    const lifecycle = new Map();
    const channels = new Map();
    const status = [];
    const ui = {
      async select() { return "native"; },
      async confirm() { return false; },
      async input() { return "native"; },
      async editor() { return "native"; },
      async custom() { throw new Error("the rpiv custom UI should be bypassed"); },
      setStatus(key, value) { status.push([key, value]); },
    };
    const pi = {
      registerTool(tool) { tools.push(tool); },
      registerCommand() {},
      on(name, handler) { lifecycle.set(name, handler); },
      appendEntry() {},
      events: {
        on(name, handler) {
          channels.set(name, handler);
          return () => {};
        },
      },
    };
    extension(pi);

    const ctx = {
      cwd: directory,
      mode: "tui",
      hasUI: true,
      signal: undefined,
      model: undefined,
      sessionManager: { getBranch: () => [] },
      ui,
    };
    await lifecycle.get("session_start")({}, ctx);

    assert.equal(await ui.select("Choose", ["First", "Second (Recommended)"]), "Second (Recommended)");
    assert.equal(await ui.confirm("Continue", "Proceed?"), true);
    assert.equal(await ui.input("Name", "placeholder"), "auto");
    assert.equal(await ui.editor("Notes", "prefill"), "auto");
    assert.equal(status.length, 1);

    channels.get("rpiv:ask-user:prompt")({
      questions: [{
        question: "Which scope?",
        header: "Scope",
        multiSelect: false,
        options: [
          { label: "Full", description: "Everything" },
          { label: "MVP (Recommended)", description: "Smallest useful slice" },
        ],
      }],
    });
    const rpivResult = await ui.custom(() => { throw new Error("not rendered"); });
    assert.equal(rpivResult.cancelled, false);
    assert.equal(rpivResult.answers[0].answer, "MVP (Recommended)");
    assert.ok(tools.find((tool) => tool.name === "decision_request"));
  } finally {
    if (previousChild === undefined) delete process.env.PI_DECISION_ROUTER_CHILD;
    else process.env.PI_DECISION_ROUTER_CHILD = previousChild;
    if (previousAudit === undefined) delete process.env.PI_DECISION_ROUTER_AUDIT_LOG;
    else process.env.PI_DECISION_ROUTER_AUDIT_LOG = previousAudit;
    await rm(directory, { recursive: true, force: true });
  }
});
