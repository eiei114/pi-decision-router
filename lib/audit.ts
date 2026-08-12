import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AuditEvent {
  timestamp: string;
  cwd: string;
  toolName: string;
  questions: unknown;
  answers: unknown;
  child: unknown;
}

let writeQueue: Promise<void> = Promise.resolve();

export function appendAuditEvent(path: string, event: AuditEvent): Promise<void> {
  const line = `${JSON.stringify(event)}\n`;
  const operation = writeQueue.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, line, "utf8");
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function readAuditTail(path: string, count = 10): Promise<string[]> {
  try {
    const text = await readFile(path, "utf8");
    return text.trim().split(/\r?\n/).filter(Boolean).slice(-count);
  } catch {
    return [];
  }
}
