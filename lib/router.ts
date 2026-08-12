import { appendAuditEvent } from "./audit.ts";
import { loadConfig, type DecisionRouterConfig } from "./config.ts";
import { chooseFallback } from "./fallback.ts";
import { runChildAgent, type ChildAgentRun, type ModelHint } from "./child-agent.ts";
import type { DecisionAnswer, DecisionBatchResult, DecisionRequest } from "./types.ts";

export interface RouterOptions {
  config?: DecisionRouterConfig;
  runChild?: typeof runChildAgent;
}

export class DecisionRouter {
  readonly config: DecisionRouterConfig;
  private readonly runChild: typeof runChildAgent;

  constructor(options: RouterOptions = {}) {
    this.config = options.config || loadConfig();
    this.runChild = options.runChild || runChildAgent;
  }

  async decide(request: DecisionRequest, signal?: AbortSignal, model?: ModelHint): Promise<DecisionBatchResult> {
    const auditedAt = new Date().toISOString();
    if (!this.config.enabled) {
      const answers = request.questions.map((question) => chooseFallback(question));
      const result: DecisionBatchResult = {
        answers,
        child: { attempted: false, status: "disabled" },
        auditedAt,
      };
      await this.audit(request, result);
      return result;
    }

    let child: ChildAgentRun = {
      answers: [],
      plan: { command: "disabled", argsPrefix: [], shell: false, source: "disabled" },
      error: "child agent disabled",
    };
    if (this.config.childEnabled) {
      try {
        child = await this.runChild(
          {
            enabled: true,
            timeoutMs: this.config.timeoutMs,
            piBin: this.config.piBin,
            provider: this.config.provider,
            model: this.config.model,
          },
          { questions: request.questions, context: request.context.slice(0, this.config.maxContextChars), cwd: request.cwd, model },
          signal,
        );
      } catch (error) {
        child = {
          answers: [],
          plan: { command: "unavailable", argsPrefix: [], shell: false, source: "error" },
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const childById = new Map(child.answers.map((answer) => [answer.id, answer]));
    const answers = request.questions.map((question) => childById.get(question.id) || chooseFallback(question));
    const usedFallback = answers.some((answer) => answer.source === "fallback");
    const result: DecisionBatchResult = {
      answers,
      child: {
        attempted: this.config.childEnabled,
        status: child.answers.length > 0 && !usedFallback ? "selected" : usedFallback ? "fallback" : "error",
        ...(child.model ? { model: child.model } : {}),
        ...(child.plan ? { command: child.plan.command } : {}),
        ...(child.error ? { error: child.error } : {}),
      },
      auditedAt,
    };
    await this.audit(request, result);
    return result;
  }

  private async audit(request: DecisionRequest, result: DecisionBatchResult): Promise<void> {
    try {
      await appendAuditEvent(this.config.auditLogPath, {
        timestamp: result.auditedAt,
        cwd: request.cwd,
        toolName: request.toolName,
        questions: request.questions,
        answers: result.answers,
        child: result.child,
      });
    } catch {
      // A decision must not become interactive again because its audit path is unavailable.
    }
  }
}

export function formatDecisionResult(result: DecisionBatchResult): string {
  const lines = result.answers.map((answer) => {
    const value = Array.isArray(answer.value) ? answer.value.join(", ") : answer.value;
    return `- ${answer.id}: ${answer.label} (${value}) — ${answer.reason}`;
  });
  const source = result.answers.every((answer) => answer.source === "child-agent") ? "child-agent" : "fallback";
  return [`Automated decision (${source}):`, ...lines].join("\n");
}

export function modelHintFromContext(context: { model?: { provider?: string; id?: string } }): ModelHint | undefined {
  if (!context.model?.provider && !context.model?.id) return undefined;
  return { provider: context.model.provider, id: context.model.id };
}

export type { DecisionAnswer };
