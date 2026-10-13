import { readFileSync } from "node:fs";

const LOAD_PREFIX = "PI_DECISION_ROUTER_SMOKE_LOAD:";
const RESULT_PREFIX = "PI_DECISION_ROUTER_SMOKE_RESULT:";

function lastAuditEvent() {
  const path = process.env.PI_DECISION_ROUTER_AUDIT_LOG;
  if (!path) return { error: "audit log path was not configured" };
  try {
    const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const event = JSON.parse(lines.at(-1) ?? "null");
    return { toolName: event.toolName, answers: event.answers, child: event.child };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export default function piSdkSmokeDriver(pi) {
  pi.registerCommand("pi-decision-router-sdk-smoke-load", {
    description: "Verify Pi Decision Router SDK smoke registration",
    handler: async (_args, ctx) => {
      const toolNames = pi.getAllTools().map((tool) => tool.name);
      ctx.ui.notify(`${LOAD_PREFIX}${JSON.stringify({ toolNames })}`, "info");
    },
  });

  pi.registerCommand("pi-decision-router-sdk-smoke", {
    description: "Exercise the Pi Decision Router question adapter",
    handler: async (_args, ctx) => {
      pi.events.emit("rpiv:ask-user:prompt", {
        questions: [{
          id: "scope",
          question: "Choose the SDK smoke-test scope",
          options: [
            { value: "minimal", label: "Minimal (Recommended)" },
            { value: "complete", label: "Complete" },
          ],
          allowOther: false,
        }],
      });
      const result = await ctx.ui.custom(() => undefined);
      ctx.ui.notify(`${RESULT_PREFIX}${JSON.stringify({ result, audit: lastAuditEvent() })}`, "info");
    },
  });
}
