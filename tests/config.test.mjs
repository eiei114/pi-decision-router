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
