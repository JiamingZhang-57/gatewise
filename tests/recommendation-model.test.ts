import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTimingRecommendation,
  getCrowdAdjustmentMinutes,
  isValidCalendarDate,
  subtractMinutesFromLocalDeparture,
} from "../src/lib/recommendation-model.js";

test("calendar validation rejects normalized and malformed dates", () => {
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2026-02-29"), false);
  assert.equal(isValidCalendarDate("2026-02-31"), false);
  assert.equal(isValidCalendarDate("2026-2-01"), false);
});

test("crowd adjustments change at the documented percentile boundaries", () => {
  assert.equal(getCrowdAdjustmentMinutes(49), -10);
  assert.equal(getCrowdAdjustmentMinutes(50), 0);
  assert.equal(getCrowdAdjustmentMinutes(79), 0);
  assert.equal(getCrowdAdjustmentMinutes(80), 15);
});

test("checked baggage and standard screening build an aggressive minimum", () => {
  const result = buildTimingRecommendation({
    checkedBag: true,
    tsaPrecheck: false,
    crowdPercentile: 80,
  });

  assert.deepEqual(result.breakdown, {
    minimumProcessMinutes: 45,
    checkedBagMinutes: 15,
    standardScreeningMinutes: 15,
    crowdAdjustmentMinutes: 15,
  });
  assert.equal(result.officialGuidelineMinutes, 120);
  assert.equal(result.recommendedMinutes, 90);
});

test("the quiet-window adjustment never breaks the 45-minute floor", () => {
  const result = buildTimingRecommendation({
    checkedBag: false,
    tsaPrecheck: true,
    crowdPercentile: 20,
  });

  assert.equal(result.breakdown.crowdAdjustmentMinutes, 0);
  assert.equal(result.recommendedMinutes, 45);
});

test("a quiet window can reduce a larger setup without crossing the floor", () => {
  const result = buildTimingRecommendation({
    checkedBag: false,
    tsaPrecheck: false,
    crowdPercentile: 20,
  });

  assert.equal(result.breakdown.crowdAdjustmentMinutes, -10);
  assert.equal(result.recommendedMinutes, 50);
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
