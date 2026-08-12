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
