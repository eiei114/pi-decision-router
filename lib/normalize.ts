import type { DecisionOption, DecisionQuestion, DecisionRequest } from "./types.ts";

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstString(record: RecordLike, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function normalizeOptions(value: unknown): DecisionOption[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (typeof item === "string") {
      const label = item.trim();
      return label ? [{ value: label, label }] : [];
    }

    if (!isRecord(item)) return [];
    const label = firstString(item, ["label", "name", "title", "value"]) || `Option ${index + 1}`;
    const optionValue = firstString(item, ["value", "id", "key"]) || label;
    const description = firstString(item, ["description", "help", "detail"]);
    return [{ value: optionValue, label, ...(description ? { description } : {}) }];
  });
}

function normalizeQuestion(item: unknown, index: number, root: RecordLike): DecisionQuestion {
  const record = isRecord(item) ? item : { question: String(item ?? "") };
  const prompt =
    firstString(record, ["question", "prompt", "text", "message", "title", "label"]) ||
    `Question ${index + 1}`;
  const id = firstString(record, ["id", "key", "name"]) || `q${index + 1}`;
  const header = firstString(record, ["header", "shortLabel"]);
  const options = normalizeOptions(record.options ?? root.options);
  const allowOther = typeof record.allowOther === "boolean" ? record.allowOther : true;
  const multiSelect =
    typeof record.multiSelect === "boolean"
      ? record.multiSelect
      : typeof root.multiSelect === "boolean"
        ? root.multiSelect
        : false;

  return { id, header, prompt, options, allowOther, multiSelect };
}

export function normalizeDecisionInput(
  toolName: string,
  input: unknown,
  cwd = process.cwd(),
  context = "",
): DecisionRequest {
  const root = isRecord(input) ? input : { question: String(input ?? "") };
  const rawQuestions = Array.isArray(root.questions) && root.questions.length > 0 ? root.questions : [root];
  const questions = rawQuestions.map((item, index) => normalizeQuestion(item, index, root));
  return {
    toolName,
    questions,
    context: asString(root.context) || asString(root.description) || context,
    cwd,
  };
}

export function isDecisionQuestion(value: unknown): value is DecisionQuestion {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.prompt === "string" &&
    Array.isArray(value.options) &&
    typeof value.allowOther === "boolean" &&
    typeof value.multiSelect === "boolean"
  );
}
