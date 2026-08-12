import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { DecisionAnswer, DecisionQuestion } from "./types.ts";

export interface ModelHint {
  provider?: string;
  id?: string;
}

export interface ChildAgentConfig {
  enabled: boolean;
  timeoutMs: number;
  piBin?: string;
  provider?: string;
  model?: string;
}

export interface ChildAgentRequest {
  questions: DecisionQuestion[];
  context: string;
  cwd: string;
  model?: ModelHint;
}

export interface SpawnPlan {
  command: string;
  argsPrefix: string[];
  shell: boolean;
  source: string;
}

export interface ChildAgentRun {
  answers: DecisionAnswer[];
  plan: SpawnPlan;
  model?: string;
  error?: string;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

const CHILD_SYSTEM_PROMPT = `You are Pi Decision Router's unattended decision delegate.

You must never ask a user a question, call a tool, edit files, or describe a plan.
Choose the best answer from the supplied options using the prompt, recent context,
and ordinary engineering judgment. Prefer an option explicitly marked recommended,
default, or preferred. If no option fits and allowOther is true, return a concise
free-form value. Return JSON only, with this exact shape:
{"answers":[{"id":"q1","value":"option-value-or-string","label":"display label","reason":"short reason","confidence":0.0}]}

For multiSelect questions, value may be an array of option values. Do not include
Markdown fences or any text outside the JSON object.`;

function isWindows(): boolean {
  return process.platform === "win32";
}

function commandExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function windowsNodePlan(candidate: string, source: string): SpawnPlan | undefined {
  const extension = extname(candidate).toLowerCase();
  const script = extension === ".cmd" ? candidate.slice(0, -4) : candidate;
  if (!commandExists(script)) return undefined;

  try {
    const prefix = readFileSync(script, "utf8").slice(0, 120);
    if (prefix.includes("node") || prefix.startsWith("#!")) {
      return { command: process.execPath, argsPrefix: [script], shell: false, source };
    }
  } catch {
    // Fall through to a direct executable plan.
  }
  return undefined;
}

function discoverPiPath(): string | undefined {
  const lookup = isWindows() ? "where.exe" : "which";
  try {
    const output = execFileSync(lookup, ["pi"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0];
  } catch {
    return undefined;
  }
}

export function resolvePiCommand(
  explicit = process.env.PI_DECISION_ROUTER_PI_BIN || process.env.PI_BIN,
): SpawnPlan {
  if (isWindows()) {
    const discovered = explicit || discoverPiPath();
    if (discovered) {
      const nodePlan = windowsNodePlan(discovered, explicit ? "explicit" : "where.exe");
      if (nodePlan) return nodePlan;
      if (extname(discovered).toLowerCase() === ".exe") {
        return { command: discovered, argsPrefix: [], shell: false, source: "executable" };
      }
      const sibling = discovered.toLowerCase().endsWith(".cmd") ? discovered.slice(0, -4) : join(dirname(discovered), basename(discovered));
      const siblingPlan = windowsNodePlan(sibling, "sibling");
      if (siblingPlan) return siblingPlan;
    }
    // Do not fall back to a shell: the question text is passed as a process
    // argument and may contain shell metacharacters. A missing shim should
    // produce a deterministic fallback decision, not a shell execution path.
    return { command: explicit || "pi.cmd", argsPrefix: [], shell: false, source: "fallback-command" };
  }

  return { command: explicit || discoverPiPath() || "pi", argsPrefix: [], shell: false, source: explicit ? "explicit" : "path" };
}

function buildPrompt(request: ChildAgentRequest): string {
  return JSON.stringify(
    {
      cwd: request.cwd,
      context: request.context.slice(0, 12_000),
      questions: request.questions,
    },
    null,
    2,
  );
}

function buildArgs(config: ChildAgentConfig, request: ChildAgentRequest): string[] {
  const args = [
    "--print",
    "--no-session",
    "--no-tools",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--thinking",
    "off",
  ];
  const provider = config.provider || request.model?.provider;
  const model = config.model || request.model?.id;
  if (provider) args.push("--provider", provider);
  if (model) args.push("--model", model);
  args.push("--system-prompt", CHILD_SYSTEM_PROMPT, buildPrompt(request));
  return args;
}

function runProcess(
  plan: SpawnPlan,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;

    const child = spawn(plan.command, [...plan.argsPrefix, ...args], {
      cwd,
      env: process.env,
      shell: plan.shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = () => {
      child.kill();
      finish({ stdout, stderr, exitCode: null, error: "aborted" });
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      finish({ stdout, stderr, exitCode: null, error: error.message });
    });
    child.once("close", (exitCode) => {
      finish({ stdout, stderr, exitCode });
    });

    timer = setTimeout(() => {
      child.kill();
      finish({ stdout, stderr, exitCode: null, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(withoutFence.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

function valueList(value: unknown): string[] | undefined {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    return values.length > 0 ? values : undefined;
  }
  return undefined;
}

function matchOption(question: DecisionQuestion, values: string[]): { value: string; label: string } | undefined {
  const matches = values.map((value) =>
    question.options.find((option) => option.value === value || option.label === value),
  );
  if (matches.some((match) => !match)) return undefined;
  const selected = matches.filter((match): match is DecisionQuestion["options"][number] => Boolean(match));
  return {
    value: selected.map((option) => option.value).join("\u0000"),
    label: selected.map((option) => option.label).join(", "),
  };
}

export function parseChildAnswers(text: string, questions: DecisionQuestion[]): DecisionAnswer[] {
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object") return [];
  const rawAnswers = (parsed as { answers?: unknown }).answers;
  if (!Array.isArray(rawAnswers)) return [];

  const answers: DecisionAnswer[] = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const raw = rawAnswers[index];
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : question.id;
    const values = valueList(record.value ?? record.answer ?? record.selected);
    if (!values) continue;
    const matched = matchOption(question, values);
    if (question.options.length > 0 && !matched && !question.allowOther) continue;
    const value = question.multiSelect
      ? matched
        ? matched.value.split("\u0000")
        : values
      : matched?.value || values[0];
    const label = (typeof record.label === "string" && record.label.trim()) || matched?.label || values.join(", ");
    const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(1, record.confidence))
      : 0.6;
    answers.push({
      id,
      value,
      label,
      reason: typeof record.reason === "string" && record.reason.trim() ? record.reason.trim() : "Child agent selected this answer.",
      confidence,
      source: "child-agent",
    });
  }
  return answers;
}

export async function runChildAgent(
  config: ChildAgentConfig,
  request: ChildAgentRequest,
  signal?: AbortSignal,
): Promise<ChildAgentRun> {
  const plan = resolvePiCommand(config.piBin);
  if (!config.enabled) {
    return { answers: [], plan, error: "child agent disabled" };
  }

  const result = await runProcess(plan, buildArgs(config, request), request.cwd, config.timeoutMs, signal);
  if (result.error || result.exitCode !== 0) {
    return {
      answers: [],
      plan,
      model: config.model || request.model?.id,
      error: result.error || `child exited with code ${result.exitCode}`,
    };
  }

  const answers = parseChildAnswers(result.stdout, request.questions);
  if (answers.length !== request.questions.length) {
    return {
      answers: [],
      plan,
      model: config.model || request.model?.id,
      error: "child returned incomplete or invalid JSON answers",
    };
  }
  return { answers, plan, model: config.model || request.model?.id };
}
