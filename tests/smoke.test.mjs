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

test("README documents every PI_DECISION_ROUTER environment variable", async () => {
  const config = await readFile(new URL("../lib/config.ts", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const variables = [...config.matchAll(/env\.(PI_DECISION_ROUTER_[A-Z0-9_]+)/g)]
    .map((match) => match[1]);

  assert.ok(variables.length > 0, "expected config to read PI_DECISION_ROUTER variables");
  for (const variable of variables) {
    assert.ok(readme.includes(variable), `README.md does not document ${variable}`);
  }
});
