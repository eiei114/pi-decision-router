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
  const readEnvironmentVariables = (source) => [...source.matchAll(
    /\benv(?:\.([A-Z_][A-Z0-9_]*)|\[\s*["']([A-Z_][A-Z0-9_]*)["']\s*\])/g,
  )]
    .map((match) => match[1] ?? match[2])
    .filter((name) => name.startsWith("PI_DECISION_ROUTER_"));
  const variables = readEnvironmentVariables(config);

  assert.ok(variables.length > 0, "expected config to read PI_DECISION_ROUTER variables");
  assert.deepEqual(
    readEnvironmentVariables('env.PI_DECISION_ROUTER_DOT; env["PI_DECISION_ROUTER_BRACKET"]'),
    ["PI_DECISION_ROUTER_DOT", "PI_DECISION_ROUTER_BRACKET"],
    "expected the guard to recognize dot and quoted-bracket environment access",
  );

  const configurationStart = readme.indexOf("## Configuration");
  assert.notEqual(configurationStart, -1, "README.md is missing its Configuration section");
  const nextSection = readme.indexOf("\n## ", configurationStart + 1);
  const configuration = readme.slice(
    configurationStart,
    nextSection === -1 ? undefined : nextSection,
  );
  const tableRows = configuration.split(/\r?\n/).filter((line) => /^\s*\|/.test(line));
  assert.ok(tableRows.length > 0, "README.md Configuration section is missing its environment table");
  const documentedVariables = new Set(tableRows.flatMap((row) =>
    row.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, "")),
  ));
  for (const variable of variables) {
    assert.ok(
      documentedVariables.has(variable),
      `README.md Configuration environment table does not document ${variable}`,
    );
  }
});
