import { createClient } from "@clickhouse/client";

// The application's own ClickHouse Cloud service.
export const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER ?? "default",
  password: process.env.CLICKHOUSE_PASSWORD ?? "",
});

// Public, read-only source used only by the ingestion task. User-facing
// analysis is served from the team's own ClickHouse Cloud table.
export const playgroundClickhouse = createClient({
  url: "https://sql-clickhouse.clickhouse.com",
  username: "demo",
  password: "",
  clickhouse_settings: {
    allow_experimental_analyzer: 1,
    result_overflow_mode: "break",
    read_overflow_mode: "break",
  },
});
