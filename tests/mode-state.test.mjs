import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modeStatePath, readPersistedMode, writePersistedMode } from "../lib/mode-state.ts";

async function tempStateFile() {
  const dir = await mkdtemp(join(tmpdir(), "pi-decision-router-mode-"));
  return join(dir, "state.json");
}

test("modeStatePath lives under ~/.pi/agent/pi-decision-router", () => {
  assert.equal(modeStatePath("C:/home"), join("C:/home", ".pi", "agent", "pi-decision-router", "state.json"));
});

test("readPersistedMode returns undefined when the state file is missing", async () => {
  const path = await tempStateFile();
  assert.equal(await readPersistedMode(path, "C:/proj"), undefined);
});

test("readPersistedMode returns the entry for the current directory", async () => {
  const path = await tempStateFile();
  await writePersistedMode(path, "C:/proj-a", { enabled: false, autoCompactionEnabled: false });

  const mode = await readPersistedMode(path, "C:/proj-a");
  assert.deepEqual(mode, { enabled: false, autoCompactionEnabled: false });
});

test("persisted entries are keyed per directory and survive unrelated writes", async () => {
  const path = await tempStateFile();
  await writePersistedMode(path, "C:/proj-a", { enabled: false, autoCompactionEnabled: false });
  await writePersistedMode(path, "C:/proj-b", { enabled: true, autoCompactionEnabled: true });

  assert.deepEqual(await readPersistedMode(path, "C:/proj-a"), { enabled: false, autoCompactionEnabled: false });
  assert.deepEqual(await readPersistedMode(path, "C:/proj-b"), { enabled: true, autoCompactionEnabled: true });
});

test("a corrupt state file reads as undefined and is replaced by the next toggle", async () => {
  const path = await tempStateFile();
  await writeFile(path, "{not json", "utf8");

  assert.equal(await readPersistedMode(path, "C:/proj"), undefined);

  await writePersistedMode(path, "C:/proj", { enabled: true, autoCompactionEnabled: true });
  const parsed = JSON.parse(await readFile(path, "utf8"));
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.projects["C:/proj"], { enabled: true, autoCompactionEnabled: true });
});

test("entries missing either flag are ignored instead of partially applied", async () => {
  const path = await tempStateFile();
  await writeFile(path, JSON.stringify({ version: 1, projects: { "C:/proj": { enabled: false } } }), "utf8");

  assert.equal(await readPersistedMode(path, "C:/proj"), undefined);
});
