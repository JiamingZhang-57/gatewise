import { logger, schedules, task } from "@trigger.dev/sdk";

import { AIRPORTS } from "@/lib/airport-advice";
import { clickhouse, playgroundClickhouse } from "@/lib/clickhouse";

type SourceAirportStat = {
  origin: string;
  city: string;
  month: number | string;
  day_of_week: number | string;
  departure_hour: number | string;
  average_flights: number | string;
  busy_day_flights: number | string;
  delayed_percent: number | string;
  cancelled_percent: number | string;
  sample_days: number | string;
};

type CloudAirportStat = {
  origin: string;
  city: string;
  month: number;
  day_of_week: number;
  departure_hour: number;
  average_flights: number;
  busy_day_flights: number;
  delayed_percent: number;
  cancelled_percent: number;
  sample_days: number;
  updated_at: string;
};

const DEFAULT_AIRPORTS = AIRPORTS.map((airport) => airport.code);
const ALLOWED_AIRPORTS = new Set<string>(DEFAULT_AIRPORTS);

async function ensureSchema() {
  await clickhouse.command({
    query: "CREATE DATABASE IF NOT EXISTS gatewise",
  });

  await clickhouse.command({
    query: `
      CREATE TABLE IF NOT EXISTS gatewise.airport_hour_stats
      (
        origin FixedString(3),
        city LowCardinality(String),
        month UInt8,
        day_of_week UInt8,
        departure_hour UInt8,
        average_flights Float32,
        busy_day_flights UInt16,
        delayed_percent Float32,
        cancelled_percent Float32,
        sample_days UInt16,
        updated_at DateTime64(3, 'UTC')
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY (origin, month, day_of_week, departure_hour)
    `,
  });
}

async function aggregateAirport(origin: string) {
  const resultSet = await playgroundClickhouse.query({
    query: `
      WITH daily_stats AS
      (
        SELECT
          FlightDate,
          Month AS month,
          DayOfWeek AS day_of_week,
          intDiv(CRSDepTime, 100) AS departure_hour,
          any(OriginCityName) AS city,
          count() AS scheduled_flights,
          avgIf(DepDel15, Cancelled = 0) AS delay_rate,
          avg(Cancelled) AS cancellation_rate
        FROM ontime.ontime
        WHERE Origin = {origin:String}
          AND Year BETWEEN 2015 AND 2025
          AND Year NOT IN (2020, 2021)
          AND CRSDepTime BETWEEN 0 AND 2359
        GROUP BY
          FlightDate,
          month,
          day_of_week,
          departure_hour
      )
      SELECT
        {origin:String} AS origin,
        any(city) AS city,
        month,
        day_of_week,
        departure_hour,
        round(avg(scheduled_flights), 1) AS average_flights,
        quantileExact(0.9)(scheduled_flights) AS busy_day_flights,
        round(avg(delay_rate) * 100, 1) AS delayed_percent,
        round(avg(cancellation_rate) * 100, 2) AS cancelled_percent,
        count() AS sample_days
      FROM daily_stats
      GROUP BY
        month,
        day_of_week,
        departure_hour
      ORDER BY
        month,
        day_of_week,
        departure_hour
    `,
    query_params: { origin },
    format: "JSONEachRow",
  });

  return resultSet.json<SourceAirportStat>();
}

async function refreshAirportStats(requestedAirports?: string[]) {
  const airports = (requestedAirports?.length
    ? requestedAirports
    : DEFAULT_AIRPORTS
  )
    .map((origin) => origin.trim().toUpperCase())
    .filter((origin) => ALLOWED_AIRPORTS.has(origin));

  if (airports.length === 0) {
    throw new Error("No supported airport codes were provided.");
  }

  await ensureSchema();
  const updatedAt = new Date()
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");
  const cloudRows: CloudAirportStat[] = [];

  for (const [index, origin] of airports.entries()) {
    logger.info("Aggregating OnTime history", {
      origin,
      airport: index + 1,
      totalAirports: airports.length,
    });

    const rows = await aggregateAirport(origin);

    cloudRows.push(
      ...rows.map((row) => ({
        origin: row.origin,
        city: row.city,
        month: Number(row.month),
        day_of_week: Number(row.day_of_week),
        departure_hour: Number(row.departure_hour),
        average_flights: Number(row.average_flights),
        busy_day_flights: Number(row.busy_day_flights),
        delayed_percent: Number(row.delayed_percent),
        cancelled_percent: Number(row.cancelled_percent),
        sample_days: Number(row.sample_days),
        updated_at: updatedAt,
      })),
    );
  }

  if (cloudRows.length === 0) {
    throw new Error("The public OnTime aggregation returned no rows.");
  }

  await clickhouse.insert({
    table: "gatewise.airport_hour_stats",
    values: cloudRows,
    format: "JSONEachRow",
  });

  const countSet = await clickhouse.query({
    query: `
      SELECT count() AS rows
      FROM gatewise.airport_hour_stats FINAL
    `,
    format: "JSONEachRow",
  });
  const countRows = await countSet.json<{ rows: number | string }>();

  logger.info("Airport statistics refreshed", {
    airports: airports.length,
    insertedRows: cloudRows.length,
    currentRows: Number(countRows[0]?.rows ?? 0),
  });

  return {
    airports,
    insertedRows: cloudRows.length,
    currentRows: Number(countRows[0]?.rows ?? 0),
    updatedAt,
  };
}

export const seedAirportStats = task({
  id: "seed-airport-stats",
  maxDuration: 600,
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 10_000,
    factor: 2,
    randomize: true,
  },
  run: async (payload: { airports?: string[] } = {}) =>
    refreshAirportStats(payload.airports),
});

export const weeklyAirportStatsRefresh = schedules.task({
  id: "weekly-airport-stats-refresh",
  cron: {
    pattern: "0 4 * * 1",
    timezone: "UTC",
    environments: ["STAGING", "PRODUCTION"],
  },
  maxDuration: 600,
  run: async () => refreshAirportStats(),
});
