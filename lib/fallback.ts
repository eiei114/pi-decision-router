import type { DecisionAnswer, DecisionQuestion, DecisionValue } from "./types.ts";

const RECOMMENDED = /recommended|recommend|default|suggested|preferred|推奨|おすすめ|既定|標準/i;
const POSITIVE = /^(yes|y|ok|okay|accept|approve|allow|continue|proceed|apply|build|public|enable|true|はい|承認|続行|適用|作成|公開|有効)$/i;
const CONFIRM = /confirm|approve|allow|continue|proceed|overwrite|delete|remove|publish|trust|確認|承認|続行|上書き|削除|公開|信頼/i;

function optionScore(question: DecisionQuestion, index: number): number {
  const option = question.options[index];
  const text = `${option.label} ${option.value} ${option.description || ""}`;
  let score = 0;
  if (RECOMMENDED.test(text)) score += 100;
  if (POSITIVE.test(option.label.trim()) || POSITIVE.test(option.value.trim())) score += 20;
  if (index === 0) score += 1;
  return score;
}

function asValue(value: DecisionValue): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

export function chooseFallback(question: DecisionQuestion): DecisionAnswer {
  if (question.options.length > 0) {
    let selectedIndex = 0;
    let selectedScore = optionScore(question, 0);
    for (let index = 1; index < question.options.length; index += 1) {
      const score = optionScore(question, index);
      if (score > selectedScore) {
        selectedIndex = index;
        selectedScore = score;
      }
    }

    const selected = question.options[selectedIndex];
    return {
      id: question.id,
      value: selected.value,
      label: selected.label,
      reason: "Child agent was unavailable or returned an invalid answer; fallback policy selected the recommended/default option or first option.",
      confidence: selectedScore >= 100 ? 0.75 : 0.35,
      source: "fallback",
    };
  }

  const value = CONFIRM.test(question.prompt) ? "yes" : "auto";
  return {
    id: question.id,
    value,
    label: value,
    reason: "No options were provided; fallback policy supplied an unattended default.",
    confidence: 0.15,
    source: "fallback",
  };
}

export function answerText(answer: DecisionAnswer): string {
  return asValue(answer.value);
}
