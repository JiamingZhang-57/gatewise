import type {
  AirportAdviceResult,
  HourlyAirportStat,
} from "@/lib/airport-advice";
import { clickhouse } from "@/lib/clickhouse";

export type AirportAdviceQuery = {
  origin: string;
  travelDate: string;
  departureTime: string;
};

type ClickHouseHourlyRow = {
  departure_hour: number | string;
  city: string;
  average_flights: number | string;
  busy_day_flights: number | string;
  delayed_percent: number | string;
  cancelled_percent: number | string;
  sample_days: number | string;
};

const DAY_LABELS = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function getTravelParts(travelDate: string) {
  const [year, month, day] = travelDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const jsDay = date.getUTCDay();

  return {
    month,
    dayOfWeek: jsDay === 0 ? 7 : jsDay,
  };
}

function subtractMinutes(
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

function toHourlyStat(row: ClickHouseHourlyRow): HourlyAirportStat {
  return {
    hour: Number(row.departure_hour),
    averageFlights: Number(Number(row.average_flights).toFixed(1)),
    busyDayFlights: Number(row.busy_day_flights),
    delayedPercent: Number(Number(row.delayed_percent).toFixed(1)),
    cancelledPercent: Number(Number(row.cancelled_percent).toFixed(2)),
    sampleDays: Number(row.sample_days),
  };
}

export async function calculateAirportAdvice(
  query: AirportAdviceQuery,
): Promise<AirportAdviceResult> {
  const origin = query.origin.trim().toUpperCase();
  const departureHour = Number(query.departureTime.slice(0, 2));
  const { month, dayOfWeek } = getTravelParts(query.travelDate);

  const resultSet = await clickhouse.query({
    query: `
      SELECT
        departure_hour,
        city,
        average_flights,
        busy_day_flights,
        delayed_percent,
        cancelled_percent,
        sample_days
      FROM gatewise.airport_hour_stats FINAL
      WHERE origin = {origin:String}
        AND month = {month:UInt8}
        AND day_of_week = {dayOfWeek:UInt8}
      ORDER BY departure_hour
    `,
    query_params: {
      origin,
      month,
      dayOfWeek,
    },
    format: "JSONEachRow",
  });

  const rows = await resultSet.json<ClickHouseHourlyRow>();
  const hourly = rows.map(toHourlyStat);

  if (hourly.length === 0) {
    throw new Error(
      `No OnTime history was found for ${origin} in the selected period.`,
    );
  }

  const selectedHour =
    hourly.find((item) => item.hour === departureHour) ??
    hourly.reduce((nearest, item) =>
      Math.abs(item.hour - departureHour) <
      Math.abs(nearest.hour - departureHour)
        ? item
        : nearest,
    );

  const orderedLoads = hourly
    .map((item) => item.averageFlights)
    .sort((a, b) => a - b);
  const rank =
    orderedLoads.filter((value) => value <= selectedHour.averageFlights)
      .length / orderedLoads.length;
  const crowdPercentile = Math.round(rank * 100);
  const crowdBufferMinutes =
    crowdPercentile >= 80 ? 30 : crowdPercentile >= 50 ? 15 : 0;
  const baselineMinutes = 120;
  const recommendedMinutes = baselineMinutes + crowdBufferMinutes;
  const riskLevel =
    selectedHour.cancelledPercent >= 2.5 ||
    selectedHour.delayedPercent >= 30
      ? "high"
      : selectedHour.cancelledPercent >= 1 ||
          selectedHour.delayedPercent >= 20
        ? "moderate"
        : "low";
  const arrival = subtractMinutes(
    query.travelDate,
    query.departureTime,
    recommendedMinutes,
  );

  return {
    origin,
    city: rows[0]?.city ?? origin,
    travelDate: query.travelDate,
    departureTime: query.departureTime,
    dayOfWeek,
    dayLabel: DAY_LABELS[dayOfWeek],
    ...arrival,
    recommendedMinutes,
    baselineMinutes,
    crowdBufferMinutes,
    crowdPercentile,
    riskLevel,
    selectedHour,
    hourly,
    dataWindow: "2015-2025, excluding 2020-2021",
    caveat:
      "Historical flight volume is a congestion proxy. Security, check-in, traffic and airline cut-off times are not included.",
  };
}
