export const US_DOMESTIC_BASELINE_MINUTES = 120;
export const CHECKED_BAG_BUFFER_MINUTES = 15;

export type TimingBreakdown = {
  officialBaselineMinutes: number;
  checkedBagBufferMinutes: number;
  crowdBufferMinutes: number;
  tsaPrecheckAdjustmentMinutes: number;
};

export type TimingRecommendation = {
  breakdown: TimingBreakdown;
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

export function getCrowdBufferMinutes(crowdPercentile: number) {
  return crowdPercentile >= 80 ? 30 : crowdPercentile >= 50 ? 15 : 0;
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
  const breakdown: TimingBreakdown = {
    officialBaselineMinutes: US_DOMESTIC_BASELINE_MINUTES,
    checkedBagBufferMinutes: checkedBag
      ? CHECKED_BAG_BUFFER_MINUTES
      : 0,
    crowdBufferMinutes: getCrowdBufferMinutes(crowdPercentile),
    // TSA describes PreCheck as expedited screening, but does not guarantee it
    // on every trip. Gatewise records the status without subtracting a fixed
    // number of minutes from the official domestic-arrival baseline.
    tsaPrecheckAdjustmentMinutes: tsaPrecheck ? 0 : 0,
  };

  return {
    breakdown,
    recommendedMinutes:
      breakdown.officialBaselineMinutes +
      breakdown.checkedBagBufferMinutes +
      breakdown.crowdBufferMinutes +
      breakdown.tsaPrecheckAdjustmentMinutes,
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
