import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("package manifest exposes only package-specific resources", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "pi-decision-router");
  assert.deepEqual(manifest.pi.extensions, ["./extensions/index.ts"]);
  assert.deepEqual(manifest.pi.skills, ["./skills"]);
  assert.equal(manifest.pi.prompts, undefined);
  assert.equal(manifest.pi.themes, undefined);
});

test("README keeps the unattended boundary visible", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /--no-tools/);
  assert.match(readme, /does not\nregister duplicate aliases/);
  assert.match(readme, /auto-approves routine decisions/);
  assert.match(readme, /decision-router-toggle/);
});
