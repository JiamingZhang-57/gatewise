import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTimingRecommendation,
  getCrowdBufferMinutes,
  isValidCalendarDate,
  subtractMinutesFromLocalDeparture,
} from "../src/lib/recommendation-model.js";

test("calendar validation rejects normalized and malformed dates", () => {
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2026-02-29"), false);
  assert.equal(isValidCalendarDate("2026-02-31"), false);
  assert.equal(isValidCalendarDate("2026-2-01"), false);
});

test("crowd buffers change at the documented percentile boundaries", () => {
  assert.equal(getCrowdBufferMinutes(49), 0);
  assert.equal(getCrowdBufferMinutes(50), 15);
  assert.equal(getCrowdBufferMinutes(79), 15);
  assert.equal(getCrowdBufferMinutes(80), 30);
});

test("a checked bag adds a visible handling buffer", () => {
  const result = buildTimingRecommendation({
    checkedBag: true,
    tsaPrecheck: false,
    crowdPercentile: 80,
  });

  assert.deepEqual(result.breakdown, {
    officialBaselineMinutes: 120,
    checkedBagBufferMinutes: 15,
    crowdBufferMinutes: 30,
    tsaPrecheckAdjustmentMinutes: 0,
  });
  assert.equal(result.recommendedMinutes, 165);
});

test("PreCheck never reduces the official two-hour baseline", () => {
  const result = buildTimingRecommendation({
    checkedBag: false,
    tsaPrecheck: true,
    crowdPercentile: 20,
  });

  assert.equal(result.breakdown.tsaPrecheckAdjustmentMinutes, 0);
  assert.equal(result.recommendedMinutes, 120);
});

test("the recommendation always equals the visible timing components", () => {
  for (const checkedBag of [false, true]) {
    for (const tsaPrecheck of [false, true]) {
      for (const crowdPercentile of [20, 60, 90]) {
        const result = buildTimingRecommendation({
          checkedBag,
          tsaPrecheck,
          crowdPercentile,
        });
        const componentTotal = Object.values(result.breakdown).reduce(
          (total, value) => total + value,
          0,
        );

        assert.equal(result.recommendedMinutes, componentTotal);
      }
    }
  }
});

test("arrival subtraction crosses midnight and the year boundary", () => {
  assert.deepEqual(
    subtractMinutesFromLocalDeparture("2027-01-01", "01:00", 150),
    {
      arrivalDate: "2026-12-31",
      arrivalTime: "22:30",
    },
  );
});
