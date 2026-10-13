import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  behaviorAssertions,
  EXPECTED_SDK_VERSIONS,
  hasExtensionLoadError,
  parseJsonLines,
  SDK_NAMES,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = process.argv.includes("--update-curated-report")
  ? resolve(root, "docs/verification/pi-sdk-smoke.json")
  : resolve(root, ".tmp/pi-sdk-smoke.json");
const driverPath = resolve(root, "tests/fixtures/pi-sdk-smoke-driver.mjs");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const sdkVersions = Object.fromEntries(SDK_NAMES.map((name) => {
  const installedVersion = readJson(resolve(root, "node_modules", name, "package.json")).version;
  if (manifest.devDependencies?.[name] !== EXPECTED_SDK_VERSIONS[name]
    || installedVersion !== EXPECTED_SDK_VERSIONS[name]) {
    throw new Error(`Smoke requires exact ${EXPECTED_SDK_VERSIONS[name]} dev/test pin for ${name}; installed ${installedVersion}`);
  }
  return [name, installedVersion];
}));
const piPackagePath = resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json");
const piManifest = readJson(piPackagePath);
const piCli = resolve(dirname(piPackagePath), piManifest.bin.pi);
const agentDir = mkdtempSync(resolve(tmpdir(), "pi-decision-router-sdk-smoke-"));
const timeoutMs = 15_000;
const baseEnv = {
  ...process.env,
  PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: "1",
  PI_DECISION_ROUTER_ENABLED: "1",
  PI_DECISION_ROUTER_AUTO_COMPACTION: "0",
  PI_DECISION_ROUTER_PROVIDER: "",
  PI_DECISION_ROUTER_MODEL: "",
  PI_DECISION_ROUTER_PI_BIN: "",
  PI_BIN: "",
};
const rpcArgs = [piCli, "--offline", "--no-session", "--no-builtin-tools", "--no-extensions", "--no-skills",
  "--no-context-files", "--no-prompt-templates", "--no-themes", "--no-mcp", "-e", ".", "-e", driverPath,
  "--mode", "rpc"];
const loadCommand = { id: "load-command", type: "prompt", message: "/pi-decision-router-sdk-smoke-load" };
const featureCommand = { id: "feature-command", type: "prompt", message: "/pi-decision-router-sdk-smoke" };
const processRuns = [];

function runPi(label, command, { childEnabled = false, missingPiBin } = {}) {
  const auditPath = resolve(agentDir, `${label.replaceAll(/[^a-z0-9-]/gi, "-")}.jsonl`);
  const env = {
    ...baseEnv,
    PI_DECISION_ROUTER_CHILD: childEnabled ? "1" : "0",
    PI_DECISION_ROUTER_AUDIT_LOG: auditPath,
    PI_DECISION_ROUTER_PI_BIN: missingPiBin || "",
  };
  return new Promise((resolveRun) => {
    let child;
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let timedOut = false;
    let finished = false;
    let stdinClosed = false;
    let timer;
    let cleanupTimer;
    const records = [];

    const finish = (code, signal, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(cleanupTimer);
      const fullOutput = `${stdout}${stderr}${error ? `\n${error.message ?? String(error)}` : ""}`;
      const responses = [...records, ...parseJsonLines(stderr)];
      const run = {
        label,
        exit_code: Number.isInteger(code) ? code : 1,
        signal: signal ?? undefined,
        stdout,
        stderr,
        fullOutput,
        responses,
        timedOut,
        hasUnhandledError: UNHANDLED_ERROR_PATTERN.test(fullOutput),
        hasLoadError: hasExtensionLoadError(responses, fullOutput),
      };
      processRuns.push(run);
      resolveRun(run);
    };

    try {
      child = spawn(process.execPath, rpcArgs, {
        cwd: root, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      });
    } catch (error) {
      finish(1, undefined, error);
      return;
    }

    const closeInputAfterResponse = () => {
      if (stdinClosed) return;
      if (!records.some((record) => record?.type === "response" && record.id === command.id)) return;
      stdinClosed = true;
      child.stdin.end();
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      lineBuffer += chunk;
      let newline;
      while ((newline = lineBuffer.indexOf("\n")) !== -1) {
        const line = lineBuffer.slice(0, newline).replace(/\r$/, "");
        lineBuffer = lineBuffer.slice(newline + 1);
        try { records.push(JSON.parse(line)); } catch { /* Keep non-protocol output in evidence. */ }
        closeInputAfterResponse();
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => finish(1, undefined, error));
    child.once("close", (code, signal) => {
      if (lineBuffer.trim()) {
        try { records.push(JSON.parse(lineBuffer)); } catch { /* Keep non-protocol output in evidence. */ }
      }
      finish(code, signal);
    });

    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      cleanupTimer = setTimeout(() => {
        if (!finished) {
          child.kill("SIGKILL");
          finish(null, "SIGKILL", new Error(`Pi RPC probe exceeded ${timeoutMs}ms and required cleanup`));
        }
      }, 1_000);
    }, timeoutMs);

    child.stdin.on("error", () => { /* A closed host is reported by its exit/output and bounded deadline. */ });
    child.stdin.write(`${JSON.stringify(command)}\n`);
  });
}

function makeCase(name, runs, responses, exit_code, process_exit_codes = [exit_code]) {
  const fullOutput = runs.map((run) => `[${run.label}]\n${run.fullOutput}`).join("\n");
  const assertions = behaviorAssertions(name, {
    responses,
    fullOutput,
    exit_code,
    process_exit_codes,
    expectedVersion: piManifest.version,
  });
  return {
    name,
    command: "npm run smoke:pi",
    exit_code,
    passed: exit_code === 0 && runs.every((run) => !run.timedOut && !run.hasUnhandledError && !run.hasLoadError)
      && assertions.every((item) => item.passed),
    evidence: fullOutput || "No process output captured",
    assertions,
  };
}

function runHostShell() {
  const env = { ...baseEnv };
  if (process.platform === "win32") {
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    if (!existsSync(shell)) throw new Error(`Native Windows PowerShell is unavailable: ${shell}`);
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    const command = `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`;
    const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", command], {
      cwd: root, env, encoding: "utf8", timeout: timeoutMs, windowsHide: true,
    });
    return { command, exit_code: Number.isInteger(result.status) ? result.status : 1,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`, timedOut: result.error?.code === "ETIMEDOUT" };
  }

  const command = '"$1" "$2" --no-extensions --version';
  const result = spawnSync("/bin/sh", ["-c", command, "pi-host-shell", process.execPath, piCli], {
    cwd: root, env, encoding: "utf8", timeout: timeoutMs, windowsHide: true,
  });
  return { command: `/bin/sh -c ${command}`, exit_code: Number.isInteger(result.status) ? result.status : 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`, timedOut: result.error?.code === "ETIMEDOUT" };
}

try {
  if (piManifest.version !== EXPECTED_SDK_VERSIONS["@earendil-works/pi-coding-agent"]) {
    throw new Error(`Expected Pi CLI ${EXPECTED_SDK_VERSIONS["@earendil-works/pi-coding-agent"]}, found ${piManifest.version}`);
  }

  const extensionLoadRun = await runPi("extension-load", loadCommand);
  const extensionLoad = makeCase("extension_load", [extensionLoadRun], extensionLoadRun.responses, extensionLoadRun.exit_code);

  const happyRun = await runPi("happy-path", featureCommand);
  const happyPath = makeCase("happy_path", [happyRun], happyRun.responses, happyRun.exit_code);

  const missingPiBin = process.platform === "win32" ? "pi-sdk-smoke-missing.exe" : "pi-sdk-smoke-missing";
  const errorRun = await runPi("error-path", featureCommand, { childEnabled: true, missingPiBin });
  const errorPath = makeCase("error_path", [errorRun], errorRun.responses, errorRun.exit_code);

  const reloadFirst = await runPi("reload-first-process", loadCommand);
  const reloadSecond = await runPi("reload-second-process", featureCommand);
  const reloadCleanup = makeCase("reload_cleanup", [reloadFirst, reloadSecond], reloadSecond.responses,
    reloadSecond.exit_code, [reloadFirst.exit_code, reloadSecond.exit_code]);

  const host = runHostShell();
  const hostAssertions = behaviorAssertions("host_shell", {
    fullOutput: host.output,
    exit_code: host.exit_code,
    expectedVersion: piManifest.version,
  });
  const hostShell = {
    name: "host_shell",
    command: "npm run smoke:pi",
    exit_code: host.exit_code,
    passed: !host.timedOut && hostAssertions.every((item) => item.passed),
    evidence: host.output || "No process output captured",
    assertions: hostAssertions,
  };

  const cases = [extensionLoad, happyPath, errorPath, reloadCleanup, hostShell];
  const failedLoadAssertions = cases.filter((item) => item.name === "extension_load" && !item.passed).length;
  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: sdkVersions,
    platform: process.platform,
    model_inference: "none; actual Pi RPC hosts load the package and exercise its extension event adapter with a deterministic local fallback",
    unhandled_errors: processRuns.filter((run) => run.hasUnhandledError).length,
    extension_load_errors: processRuns.filter((run) => run.hasLoadError).length + failedLoadAssertions,
    cases,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT, platform: process.platform,
    cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })),
    unhandled_errors: report.unhandled_errors, extension_load_errors: report.extension_load_errors }));
  if (cases.some((item) => !item.passed) || report.unhandled_errors !== 0 || report.extension_load_errors !== 0) {
    process.exitCode = 1;
  }
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}
