export const US_DOMESTIC_GUIDELINE_MINUTES = 120;
export const MINIMUM_AIRPORT_PROCESS_MINUTES = 45;
export const CHECKED_BAG_PROCESS_MINUTES = 15;
export const STANDARD_SCREENING_PROCESS_MINUTES = 15;

export type TimingBreakdown = {
  minimumProcessMinutes: number;
  checkedBagMinutes: number;
  standardScreeningMinutes: number;
  crowdAdjustmentMinutes: number;
};

export type TimingRecommendation = {
  breakdown: TimingBreakdown;
  officialGuidelineMinutes: number;
  recommendedMinutes: number;
};

export function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function getCrowdAdjustmentMinutes(crowdPercentile: number) {
  return crowdPercentile >= 80 ? 15 : crowdPercentile >= 50 ? 0 : -10;
}

export function buildTimingRecommendation({
  checkedBag,
  tsaPrecheck,
  crowdPercentile,
}: {
  checkedBag: boolean;
  tsaPrecheck: boolean;
  crowdPercentile: number;
}): TimingRecommendation {
  const minimumProcessMinutes = MINIMUM_AIRPORT_PROCESS_MINUTES;
  const checkedBagMinutes = checkedBag ? CHECKED_BAG_PROCESS_MINUTES : 0;
  const standardScreeningMinutes = tsaPrecheck
    ? 0
    : STANDARD_SCREENING_PROCESS_MINUTES;
  const baseMinutes =
    minimumProcessMinutes + checkedBagMinutes + standardScreeningMinutes;
  const requestedCrowdAdjustment =
    getCrowdAdjustmentMinutes(crowdPercentile);
  const crowdAdjustmentMinutes = Math.max(
    requestedCrowdAdjustment,
    MINIMUM_AIRPORT_PROCESS_MINUTES - baseMinutes,
  );
  const breakdown: TimingBreakdown = {
    minimumProcessMinutes,
    checkedBagMinutes,
    standardScreeningMinutes,
    crowdAdjustmentMinutes,
  };

  return {
    breakdown,
    officialGuidelineMinutes: US_DOMESTIC_GUIDELINE_MINUTES,
    recommendedMinutes:
      breakdown.minimumProcessMinutes +
      breakdown.checkedBagMinutes +
      breakdown.standardScreeningMinutes +
      breakdown.crowdAdjustmentMinutes,
  };
}

export function subtractMinutesFromLocalDeparture(
  travelDate: string,
  departureTime: string,
  minutes: number,
) {
  const [year, month, day] = travelDate.split("-").map(Number);
  const [hour, minute] = departureTime.split(":").map(Number);
  const departure = Date.UTC(year, month - 1, day, hour, minute);
  const arrival = new Date(departure - minutes * 60_000);

  return {
    arrivalDate: arrival.toISOString().slice(0, 10),
    arrivalTime: arrival.toISOString().slice(11, 16),
  };
}
