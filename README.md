# Gatewise

Gatewise turns a U.S. domestic flight question into a visual airport-arrival
recommendation.
The current vertical slice uses:

- **ClickHouse Cloud** for the app-owned airport analytics mart.
- **ClickHouse OnTime** as the public source for historical airport traffic,
  delay and cancellation statistics.
- **Trigger.dev** for the live `chat.agent`, typed ClickHouse tool calls,
  resilient ingestion and weekly refreshes.
- **Gemini** for translating natural-language travel questions into typed tool
  inputs. The calculation itself stays deterministic and data-backed.
- **Next.js** for secure chat-session actions and the interactive visual answer.

## Run locally

Open two terminals in the project root:

```powershell
pnpm trigger:dev
```

```powershell
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` values into `.env` and use credentials for the team's own
ClickHouse Cloud service, Trigger.dev development environment and Google AI
Studio project.

Never expose `TRIGGER_SECRET_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` or ClickHouse
credentials in frontend code. The browser receives only a short-lived,
session-scoped Trigger.dev public token.

## Live agent flow

1. The traveller asks a natural-language question.
2. Gemini extracts the airport, local departure date/time, domestic scope,
   checked-bag status and TSA PreCheck status.
3. Trigger.dev runs the typed `analyzeAirport` tool.
4. The tool queries the app-owned ClickHouse analytics mart.
5. The frontend renders the returned recommendation as an explorable timeline,
   traffic curve and evidence cards.

The model never writes SQL and never invents the recommendation. If a required
trip value is missing, the agent asks one short combined follow-up question.
International trips are rejected rather than silently analyzed with domestic
data.

## Seed the analytics mart

The `seed-airport-stats` Trigger.dev task reads the public OnTime source,
aggregates one airport at a time, and writes the results into:

```text
gatewise.airport_hour_stats
```

The table uses `ReplacingMergeTree` so refreshes are idempotent at the
airport/month/weekday/hour grain. A second task,
`weekly-airport-stats-refresh`, refreshes the mart every Monday at 04:00 UTC in
staging and production.

## Current recommendation model

The task looks at the selected airport, travel month, weekday and departure
hour across 2015–2025, excluding the pandemic years 2020–2021. The visible
formula starts from the official 120-minute domestic-flight baseline and adds:

- 15 minutes when the traveller is checking a bag. This is a Gatewise handling
  margin, not an airline rule.
- 0 minutes below the 50th airport-hour traffic percentile.
- 15 minutes from the 50th to 79th percentile.
- 30 minutes at or above the 80th percentile.

TSA PreCheck is displayed but never subtracts a fixed number of minutes because
expedited screening is not guaranteed on every trip. The interface shows both
the data-informed comfort target and the official two-hour guideline.

This is a historical flight-activity estimate, not a security-queue
prediction. The OnTime dataset does not include passenger arrival, check-in,
security, road-traffic or walking-time observations. Always verify the
operating airline's check-in and baggage cut-offs.

## Rule sources

- [TSA travel tips](https://www.tsa.gov/news/press/factsheets/tsa-travel-tips)
  — travellers are encouraged to arrive two hours before departure.
- [American Airlines U.S. check-in guidance](https://www.aa.com/i18n/travel-info/check-in-and-arrival.jsp?locale=en_US)
  — two-hour domestic arrival guidance and common check-in cut-offs.
- [Delta U.S. check-in guidance](https://www.delta.com/us/en/check-in-security/check-in-time-requirements/domestic-check-in)
  — two-hour guidance plus airport-specific baggage exceptions.

Rules were last checked on 2026-07-20.

## Verify

```powershell
pnpm test
pnpm typecheck
pnpm build
```

## License

[MIT](LICENSE)
