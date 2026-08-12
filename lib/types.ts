export type DecisionValue = string | string[];

export type DecisionSource = "child-agent" | "fallback";

export interface DecisionOption {
  value: string;
  label: string;
  description?: string;
}

export interface DecisionQuestion {
  id: string;
  header?: string;
  prompt: string;
  options: DecisionOption[];
  allowOther: boolean;
  multiSelect: boolean;
}

export interface DecisionRequest {
  toolName: string;
  questions: DecisionQuestion[];
  context: string;
  cwd: string;
}

export interface DecisionAnswer {
  id: string;
  value: DecisionValue;
  label: string;
  reason: string;
  confidence: number;
  source: DecisionSource;
}

export interface ChildAgentMetadata {
  attempted: boolean;
  status: "disabled" | "selected" | "fallback" | "error";
  model?: string;
  command?: string;
  error?: string;
}

export interface DecisionBatchResult {
  answers: DecisionAnswer[];
  child: ChildAgentMetadata;
  auditedAt: string;
}
