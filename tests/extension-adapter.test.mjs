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
  const previousEnabled = process.env.PI_DECISION_ROUTER_ENABLED;
  const previousAudit = process.env.PI_DECISION_ROUTER_AUDIT_LOG;
  process.env.PI_DECISION_ROUTER_CHILD = "0";
  process.env.PI_DECISION_ROUTER_ENABLED = "1";
  process.env.PI_DECISION_ROUTER_AUDIT_LOG = join(directory, "audit.jsonl");

  try {
    const tools = [];
    const commands = new Map();
    const lifecycle = new Map();
    const channels = new Map();
    const status = [];
    const notifications = [];
    const nativeCalls = { select: 0 };
    const ui = {
      async select() { nativeCalls.select += 1; return "native"; },
      async confirm() { return false; },
      async input() { return "native"; },
      async editor() { return "native"; },
      async custom() { throw new Error("the rpiv custom UI should be bypassed"); },
      notify(message, type) { notifications.push([message, type]); },
      setStatus(key, value) { status.push([key, value]); },
    };
    const pi = {
      registerTool(tool) { tools.push(tool); },
      registerCommand(name, command) { commands.set(name, command); },
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

    assert.match(status.at(-1)[1], /Decision Router: \[ON\]/);
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

    const toggle = commands.get("decision-router-toggle");
    assert.ok(toggle, "toggle command should be registered");
    await toggle.handler("", ctx);
    assert.match(status.at(-1)[1], /Decision Router: \[OFF\]/);
    await ui.select("Native", ["native"]);
    assert.equal(nativeCalls.select, 1, "disabled router should delegate to native UI");
    assert.match(notifications.at(-1)[0], /Pi Decision Router: OFF/);

    await toggle.handler("", ctx);
    assert.match(status.at(-1)[1], /Decision Router: \[ON\]/);
    await ui.select("Choose again", ["First", "Second (Recommended)"]);
    assert.equal(nativeCalls.select, 1, "enabled router should intercept UI again");
  } finally {
    if (previousChild === undefined) delete process.env.PI_DECISION_ROUTER_CHILD;
    else process.env.PI_DECISION_ROUTER_CHILD = previousChild;
    if (previousEnabled === undefined) delete process.env.PI_DECISION_ROUTER_ENABLED;
    else process.env.PI_DECISION_ROUTER_ENABLED = previousEnabled;
    if (previousAudit === undefined) delete process.env.PI_DECISION_ROUTER_AUDIT_LOG;
    else process.env.PI_DECISION_ROUTER_AUDIT_LOG = previousAudit;
    await rm(directory, { recursive: true, force: true });
  }
});
