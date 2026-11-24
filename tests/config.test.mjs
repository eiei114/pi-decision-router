import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../lib/config.ts";

test("automatic compaction defaults to 95% with a 100% emergency threshold", () => {
  const config = loadConfig({}, "C:/tmp/pi-decision-router");

  assert.equal(config.autoCompactionEnabled, true);
  assert.equal(config.autoCompactionThresholdPercent, 95);
  assert.equal(config.autoCompactionEmergencyPercent, 100);
});

test("automatic compaction thresholds and switch are configurable", () => {
  const config = loadConfig({
    PI_DECISION_ROUTER_AUTO_COMPACTION: "0",
    PI_DECISION_ROUTER_COMPACTION_THRESHOLD_PERCENT: "90.5",
    PI_DECISION_ROUTER_COMPACTION_EMERGENCY_PERCENT: "99.5",
  }, "C:/tmp/pi-decision-router");

  assert.equal(config.autoCompactionEnabled, false);
  assert.equal(config.autoCompactionThresholdPercent, 90.5);
  assert.equal(config.autoCompactionEmergencyPercent, 99.5);
});

for (const [value, threshold, emergency] of [
  ["", 95, 100],
  [" \t\n", 95, 100],
  ["0", 0, 0],
  [" 90.5 ", 90.5, 90.5],
  ["100", 100, 100],
  ["invalid", 95, 100],
  ["Infinity", 95, 100],
  ["-1", 95, 100],
  ["101", 95, 100],
]) {
  test(`automatic compaction parses both thresholds for ${JSON.stringify(value)}`, () => {
    const config = loadConfig({
      PI_DECISION_ROUTER_COMPACTION_THRESHOLD_PERCENT: value,
      PI_DECISION_ROUTER_COMPACTION_EMERGENCY_PERCENT: value,
    });

    assert.equal(config.autoCompactionThresholdPercent, threshold);
    assert.equal(config.autoCompactionEmergencyPercent, emergency);
  });
}

test("child timeout accepts both endpoints of the Node timer range", () => {
  for (const timeoutMs of [1, 2_147_483_647]) {
    const config = loadConfig({ PI_DECISION_ROUTER_TIMEOUT_MS: String(timeoutMs) });
    assert.equal(config.timeoutMs, timeoutMs);
  }
});

for (const value of [undefined, "0", "-1", "1.5", "invalid", "Infinity", "2147483648", "9007199254740992"]) {
  test(`child timeout defaults to 45,000 ms for ${JSON.stringify(value)}`, () => {
    const config = loadConfig(value === undefined ? {} : { PI_DECISION_ROUTER_TIMEOUT_MS: value });
    assert.equal(config.timeoutMs, 45_000);
  });
}

test("maximum child context characters defaults to 12,000 for missing, zero, or invalid values", () => {
  for (const value of [undefined, "0", "invalid"]) {
    const config = loadConfig({
      ...(value === undefined ? {} : { PI_DECISION_ROUTER_MAX_CONTEXT_CHARS: value }),
    }, "C:/tmp/pi-decision-router");

    assert.equal(config.maxContextChars, 12_000);
  }
});

test("maximum child context characters accepts values below the 12,000 cap", () => {
  const config = loadConfig({ PI_DECISION_ROUTER_MAX_CONTEXT_CHARS: "8000" }, "C:/tmp/pi-decision-router");

  assert.equal(config.maxContextChars, 8_000);
});

test("maximum child context characters accepts the exact 12,000 cap", () => {
  const config = loadConfig({ PI_DECISION_ROUTER_MAX_CONTEXT_CHARS: "12000" }, "C:/tmp/pi-decision-router");

  assert.equal(config.maxContextChars, 12_000);
});

test("maximum child context characters clamps values above 12,000", () => {
  const config = loadConfig({ PI_DECISION_ROUTER_MAX_CONTEXT_CHARS: "16000" }, "C:/tmp/pi-decision-router");

  assert.equal(config.maxContextChars, 12_000);
});
