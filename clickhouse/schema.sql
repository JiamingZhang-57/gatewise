CREATE DATABASE IF NOT EXISTS gatewise;

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
ORDER BY (origin, month, day_of_week, departure_hour);
