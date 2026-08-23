import { homedir } from "node:os";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface PersistedMode {
  enabled: boolean;
  autoCompactionEnabled: boolean;
}

interface PersistedModeFile {
  version?: unknown;
  projects?: Record<string, Partial<PersistedMode>>;
}

export function modeStatePath(home = homedir()): string {
  return join(home, ".pi", "agent", "pi-decision-router", "state.json");
}

function normalizeMode(value: Partial<PersistedMode> | undefined): PersistedMode | undefined {
  if (typeof value?.enabled !== "boolean" || typeof value?.autoCompactionEnabled !== "boolean") return undefined;
  return { enabled: value.enabled, autoCompactionEnabled: value.autoCompactionEnabled };
}

export async function readPersistedMode(path: string, cwd: string): Promise<PersistedMode | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as PersistedModeFile;
    if (!parsed.projects || typeof parsed.projects !== "object") return undefined;
    return normalizeMode(parsed.projects[cwd]);
  } catch {
    // Corrupt state must never block startup; env/default precedence still applies.
    return undefined;
  }
}

export async function writePersistedMode(path: string, cwd: string, mode: PersistedMode): Promise<boolean> {
  let parsed: PersistedModeFile = { version: 1, projects: {} };
  try {
    const text = await readFile(path, "utf8");
    const existing = JSON.parse(text) as PersistedModeFile;
    if (existing && typeof existing === "object") {
      parsed = {
        version: 1,
        projects: typeof existing.projects === "object" && existing.projects !== null ? existing.projects : {},
      };
    }
  } catch {
    // Missing or corrupt file: start a fresh map rather than failing the toggle.
  }
  parsed.version = 1;
  parsed.projects = { ...parsed.projects, [cwd]: mode };

  try {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await rename(tempPath, path);
    return true;
  } catch {
    return false;
  }
}
