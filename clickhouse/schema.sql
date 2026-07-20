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

CREATE TABLE IF NOT EXISTS gatewise.chat_usage_events
(
    event_id UUID,
    event_type Enum8('session_start' = 1, 'model_turn' = 2),
    subject String,
    chat_id String,
    event_key String DEFAULT toString(event_id),
    occurred_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY (event_type, subject, occurred_at, event_id)
TTL toDateTime(occurred_at) + INTERVAL 7 DAY DELETE;

ALTER TABLE gatewise.chat_usage_events
ADD COLUMN IF NOT EXISTS event_key String DEFAULT toString(event_id);
