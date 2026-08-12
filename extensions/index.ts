import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
  ExtensionUIDialogOptions,
} from "@earendil-works/pi-coding-agent";
import { appendAuditEvent, readAuditTail } from "../lib/audit.ts";
import { loadConfig } from "../lib/config.ts";
import { answerText } from "../lib/fallback.ts";
import { DecisionRouter, formatDecisionResult, modelHintFromContext } from "../lib/router.ts";
import { normalizeDecisionInput } from "../lib/normalize.ts";
import { Type } from "typebox";

const optionSchema = Type.Object(
  {
    value: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

const questionSchema = Type.Object(
  {
    id: Type.Optional(Type.String()),
    key: Type.Optional(Type.String()),
    header: Type.Optional(Type.String()),
    shortLabel: Type.Optional(Type.String()),
    question: Type.Optional(Type.String()),
    prompt: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    message: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
    options: Type.Optional(Type.Array(optionSchema)),
    allowOther: Type.Optional(Type.Boolean()),
    multiSelect: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const decisionSchema = Type.Object(
  {
    id: Type.Optional(Type.String()),
    question: Type.Optional(Type.String()),
    prompt: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    message: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    context: Type.Optional(Type.String()),
    options: Type.Optional(Type.Array(optionSchema)),
    questions: Type.Optional(Type.Array(questionSchema)),
    allowOther: Type.Optional(Type.Boolean()),
    multiSelect: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const REGISTERED_TOOL_NAMES = ["decision_request"];
const EXTERNAL_QUESTION_TOOL_NAMES = [
  "question",
  "questionnaire",
  "ask_question",
  "ask_user_question",
  "AskUserQuestion",
];
const STATUS_KEY = "pi-decision-router";
const TOGGLE_COMMAND = "/decision-router-toggle";

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: string; text?: string } => typeof item === "object" && item !== null && "type" in item)
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text || "")
    .join("\n");
}

function contextExcerpt(ctx: ExtensionContext, maxChars: number): string {
  try {
    const entries = ctx.sessionManager.getBranch().slice(-12);
    const lines = entries.flatMap((entry) => {
      if (entry.type !== "message") return [];
      const message = entry.message as { role?: string; content?: unknown };
      const text = contentText(message.content).trim();
      return text ? [`${message.role || "message"}: ${text}`] : [];
    });
    return lines.join("\n").slice(-maxChars);
  } catch {
    return "";
  }
}

function booleanAnswer(value: string): boolean {
  return /^(true|yes|y|ok|okay|approve|allow|continue|proceed|はい|承認|続行)$/i.test(value.trim());
}

interface UiShimState {
  context: ExtensionContext;
  router: DecisionRouter;
  runtime: DecisionRuntime;
  originalSelect: ExtensionUIContext["select"];
  originalConfirm: ExtensionUIContext["confirm"];
  originalInput: ExtensionUIContext["input"];
  originalEditor: ExtensionUIContext["editor"];
  originalCustom: ExtensionUIContext["custom"];
}

interface DecisionRuntime {
  context?: ExtensionContext;
  pendingCustomDecision?: Promise<unknown>;
  canonicalToolWasActive?: boolean;
}

const uiShimStates = new WeakMap<object, UiShimState>();

function statusText(router: DecisionRouter): string {
  const state = router.config.enabled ? "ON" : "OFF";
  return `Decision Router: [${state}] | Enter ${TOGGLE_COMMAND} to switch`;
}

function updateStatus(ctx: ExtensionContext, router: DecisionRouter): void {
  if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, statusText(router));
}

function setEnabled(router: DecisionRouter, ctx: ExtensionContext, enabled: boolean): void {
  router.config.enabled = enabled;
  updateStatus(ctx, router);
}

function syncCanonicalTool(pi: ExtensionAPI, runtime: DecisionRuntime, enabled: boolean): void {
  const api = pi as unknown as {
    getActiveTools?: () => string[];
    setActiveTools?: (toolNames: string[]) => void;
  };
  if (typeof api.getActiveTools !== "function" || typeof api.setActiveTools !== "function") return;

  const activeTools = api.getActiveTools.call(pi);
  if (enabled) {
    if (runtime.canonicalToolWasActive && !activeTools.includes("decision_request")) {
      api.setActiveTools.call(pi, [...activeTools, "decision_request"]);
    }
    runtime.canonicalToolWasActive = undefined;
    return;
  }

  if (runtime.canonicalToolWasActive === undefined) {
    runtime.canonicalToolWasActive = activeTools.includes("decision_request");
  }
  if (activeTools.includes("decision_request")) {
    api.setActiveTools.call(pi, activeTools.filter((name) => name !== "decision_request"));
  }
}

function installUiShim(ctx: ExtensionContext, router: DecisionRouter, runtime: DecisionRuntime): void {
  if (!ctx.hasUI) return;

  const existing = uiShimStates.get(ctx.ui);
  if (existing) {
    existing.context = ctx;
    existing.router = router;
    existing.runtime = runtime;
    return;
  }

  const ui = ctx.ui as ExtensionUIContext;
  const state: UiShimState = {
    context: ctx,
    router,
    runtime,
    originalSelect: ui.select.bind(ui),
    originalConfirm: ui.confirm.bind(ui),
    originalInput: ui.input.bind(ui),
    originalEditor: ui.editor.bind(ui),
    originalCustom: ui.custom.bind(ui),
  };

  const select = async (title: string, options: string[], opts?: ExtensionUIDialogOptions) => {
    const activeContext = state.context;
    const activeRouter = state.router;
    if (!activeRouter.config.enabled) return state.originalSelect(title, options, opts);
    const request = normalizeDecisionInput(
      "ctx.ui.select",
      { question: title, options, allowOther: false },
      activeContext.cwd,
      contextExcerpt(activeContext, activeRouter.config.maxContextChars),
    );
    const result = await activeRouter.decide(request, opts?.signal || activeContext.signal, modelHintFromContext(activeContext));
    const value = answerText(result.answers[0]);
    return options.includes(value) ? value : options[0];
  };

  const confirm = async (title: string, message: string, opts?: ExtensionUIDialogOptions) => {
    const activeContext = state.context;
    const activeRouter = state.router;
    if (!activeRouter.config.enabled) return state.originalConfirm(title, message, opts);
    const request = normalizeDecisionInput(
      "ctx.ui.confirm",
      {
        question: `${title}\n${message}`,
        options: [
          { value: "yes", label: "Yes", description: "Approve and continue." },
          { value: "no", label: "No", description: "Decline and stop this action." },
        ],
        allowOther: false,
      },
      activeContext.cwd,
      contextExcerpt(activeContext, activeRouter.config.maxContextChars),
    );
    const result = await activeRouter.decide(request, opts?.signal || activeContext.signal, modelHintFromContext(activeContext));
    return booleanAnswer(answerText(result.answers[0]));
  };

  const input = async (title: string, placeholder?: string, opts?: ExtensionUIDialogOptions) => {
    const activeContext = state.context;
    const activeRouter = state.router;
    if (!activeRouter.config.enabled) return state.originalInput(title, placeholder, opts);
    const request = normalizeDecisionInput(
      "ctx.ui.input",
      {
        question: `${title}${placeholder ? `\nPlaceholder: ${placeholder}` : ""}`,
        allowOther: true,
      },
      activeContext.cwd,
      contextExcerpt(activeContext, activeRouter.config.maxContextChars),
    );
    const result = await activeRouter.decide(request, opts?.signal || activeContext.signal, modelHintFromContext(activeContext));
    return answerText(result.answers[0]);
  };

  const editor = async (title: string, prefill?: string) => {
    const activeContext = state.context;
    const activeRouter = state.router;
    if (!activeRouter.config.enabled) return state.originalEditor(title, prefill);
    const request = normalizeDecisionInput(
      "ctx.ui.editor",
      {
        question: `${title}${prefill ? `\nPrefilled value: ${prefill}` : ""}`,
        allowOther: true,
      },
      activeContext.cwd,
      contextExcerpt(activeContext, activeRouter.config.maxContextChars),
    );
    const result = await activeRouter.decide(request, activeContext.signal, modelHintFromContext(activeContext));
    return answerText(result.answers[0]);
  };

  try {
    ui.select = select;
    ui.confirm = confirm;
    ui.input = input;
    ui.editor = editor;
    ui.custom = (async (
      factory: Parameters<ExtensionUIContext["custom"]>[0],
      options?: Parameters<ExtensionUIContext["custom"]>[1],
    ) => {
      if (!state.router.config.enabled) {
        state.runtime.pendingCustomDecision = undefined;
        return await state.originalCustom(factory, options);
      }
      const pending = state.runtime.pendingCustomDecision;
      if (pending) {
        state.runtime.pendingCustomDecision = undefined;
        return await pending;
      }
      return await state.originalCustom(factory, options);
    }) as ExtensionUIContext["custom"];
    uiShimStates.set(ctx.ui, state);
  } catch {
    // Some hosts may freeze the UI object. Leave that host's native dialogs intact.
  }

}

async function auditToggle(router: DecisionRouter, cwd: string, enabled: boolean): Promise<void> {
  try {
    await appendAuditEvent(router.config.auditLogPath, {
      timestamp: new Date().toISOString(),
      cwd,
      toolName: "decision-router-toggle",
      questions: [{ id: "enabled", prompt: "Enable unattended decisions?", options: ["on", "off"] }],
      answers: [{
        id: "enabled",
        value: enabled ? "on" : "off",
        label: enabled ? "ON" : "OFF",
        source: "fallback",
        reason: "Manual toggle command.",
      }],
      child: { attempted: false, status: "disabled" },
    });
  } catch {
    // A toggle must not fail because the audit path is unavailable.
  }
}

function rpivResult(request: ReturnType<typeof normalizeDecisionInput>, result: Awaited<ReturnType<DecisionRouter["decide"]>>): unknown {
  return {
    answers: result.answers.map((answer, index) => {
      const question = request.questions[index];
      const values = Array.isArray(answer.value) ? answer.value : [answer.value];
      const selected = values
        .map((value) => question.options.find((option) => option.value === value || option.label === value)?.label)
        .filter((value): value is string => Boolean(value));
      if (question.multiSelect) {
        return {
          questionIndex: index,
          question: question.prompt,
          kind: "multi",
          answer: null,
          selected: selected.length > 0 ? selected : values,
        };
      }
      const isOption = selected.length > 0;
      return {
        questionIndex: index,
        question: question.prompt,
        kind: isOption ? "option" : "custom",
        answer: isOption ? selected[0] : String(values[0]),
      };
    }),
    cancelled: false,
  };
}

function registerRpivAdapter(pi: ExtensionAPI, router: DecisionRouter, runtime: DecisionRuntime): void {
  pi.events.on("rpiv:ask-user:prompt", (payload) => {
    if (!router.config.enabled || !payload || typeof payload !== "object") return;
    const context = runtime.context;
    const request = normalizeDecisionInput(
      "rpiv:ask-user:prompt",
      payload,
      context?.cwd || process.cwd(),
      context ? contextExcerpt(context, router.config.maxContextChars) : "",
    );
    runtime.pendingCustomDecision = router
      .decide(request, context?.signal, context ? modelHintFromContext(context) : undefined)
      .then((result) => rpivResult(request, result))
      .catch(() => ({ answers: [], cancelled: true }));
  });

  pi.events.on("rpiv:ask-user:blocked", (payload) => {
    if (payload && typeof payload === "object" && (payload as { active?: unknown }).active === false) {
      runtime.pendingCustomDecision = undefined;
    }
  });
}

function registerDecisionTool(pi: ExtensionAPI, router: DecisionRouter, name: string): void {
  pi.registerTool({
    name,
    label: `Decision Router (${name})`,
    description: "Answer a question or confirmation without waiting for a human. The answer is selected by a child Pi agent and recorded in an audit log.",
    promptSnippet: `${name}: route a question or confirmation to the unattended decision agent`,
    promptGuidelines: [`Use ${name} when a routine choice is needed and unattended execution is enabled.`],
    parameters: decisionSchema,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = normalizeDecisionInput(
        name,
        params,
        ctx.cwd,
        contextExcerpt(ctx, router.config.maxContextChars),
      );
      const result = await router.decide(request, signal || ctx.signal, modelHintFromContext(ctx));
      try {
        pi.appendEntry("pi-decision-router", result);
      } catch {
        // Session persistence is best effort; the external audit log is primary.
      }
      return {
        content: [{ type: "text", text: formatDecisionResult(result) }],
        details: result,
      };
    },
  });
}

export default function decisionRouterExtension(pi: ExtensionAPI): void {
  const router = new DecisionRouter({ config: loadConfig() });
  const runtime: DecisionRuntime = {};

  for (const name of REGISTERED_TOOL_NAMES) {
    registerDecisionTool(pi, router, name);
  }
  registerRpivAdapter(pi, router, runtime);

  pi.registerCommand("decision-router-toggle", {
    description: "Toggle unattended decisions on/off (press Enter to switch)",
    handler: async (_args, ctx) => {
      runtime.context = ctx;
      setEnabled(router, ctx, !router.config.enabled);
      syncCanonicalTool(pi, runtime, router.config.enabled);
      installUiShim(ctx, router, runtime);
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Pi Decision Router: ${router.config.enabled ? "ON" : "OFF"}\nEnter ${TOGGLE_COMMAND} again to switch.`,
          "info",
        );
      }
      await auditToggle(router, ctx.cwd, router.config.enabled);
    },
  });

  pi.on("project_trust", async (event) => {
    if (!router.config.enabled) return { trusted: "undecided" as const };
    try {
      await appendAuditEvent(router.config.auditLogPath, {
        timestamp: new Date().toISOString(),
        cwd: event.cwd,
        toolName: "project_trust",
        questions: [{ id: "trust", prompt: `Trust project ${event.cwd}?`, options: ["yes", "no"] }],
        answers: [{ id: "trust", value: "yes", label: "yes", source: "fallback", reason: "Unattended project trust policy." }],
        child: { attempted: false, status: "disabled" },
      });
    } catch {
      // Trust behavior must not be made interactive by a logging failure.
    }
    return { trusted: "yes" as const, remember: true };
  });

  pi.on("session_start", async (_event, ctx) => {
    runtime.context = ctx;
    installUiShim(ctx, router, runtime);
    syncCanonicalTool(pi, runtime, router.config.enabled);
    updateStatus(ctx, router);
  });

  pi.on("before_agent_start", async (event) => {
    if (!router.config.enabled) return;
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n[pi-decision-router] Routine questions and confirmations are handled automatically. Use the available decision-router question tool when a structured choice is required; do not wait for a human response.",
    };
  });

  pi.on("tool_call", async (_event, ctx) => {
    runtime.context = ctx;
    installUiShim(ctx, router, runtime);
  });

  pi.registerCommand("decision-router-status", {
    description: "Show Pi Decision Router configuration",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(
        [
          `enabled: ${router.config.enabled}`,
          `toggle: ${TOGGLE_COMMAND} (press Enter to switch)`,
          `child: ${router.config.childEnabled}`,
          `timeout: ${router.config.timeoutMs}ms`,
          `audit: ${router.config.auditLogPath}`,
          `registered tool: ${REGISTERED_TOOL_NAMES.join(", ")}`,
          `external adapters: ${EXTERNAL_QUESTION_TOOL_NAMES.join(", ")}`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.registerCommand("decision-router-log", {
    description: "Show recent automated decisions",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const lines = await readAuditTail(router.config.auditLogPath, 10);
      ctx.ui.notify(lines.length > 0 ? lines.join("\n") : "No decision audit entries.", "info");
    },
  });
}
