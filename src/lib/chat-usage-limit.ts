const SESSION_WINDOW_MINUTES = 30;
const MAX_VISITOR_SESSIONS_PER_WINDOW = 3;
const MAX_GLOBAL_SESSIONS_PER_WINDOW = 30;
const MAX_MODEL_TURNS_PER_CHAT = 6;
const VISIBILITY_POLL_DELAYS_MS = [25, 50, 100, 200, 400, 800];

type UsageEventType = "model_turn" | "session_start";

let usageTableReady: Promise<void> | undefined;

function clickhouseEndpoint(params: Record<string, string> = {}) {
  const url = process.env.CLICKHOUSE_URL;

  if (!url) {
    throw new Error("ClickHouse usage protection is unavailable.");
  }

  const endpoint = new URL(url);
  endpoint.searchParams.set("async_insert", "1");
  endpoint.searchParams.set("use_query_cache", "0");
  endpoint.searchParams.set("wait_for_async_insert", "1");
  endpoint.searchParams.set("wait_end_of_query", "1");

  for (const [key, value] of Object.entries(params)) {
    endpoint.searchParams.set(`param_${key}`, value);
  }

  return endpoint;
}

function basicAuthorization() {
  const username = process.env.CLICKHOUSE_USER ?? "default";
  const password = process.env.CLICKHOUSE_PASSWORD ?? "";
  const credentials = `${username}:${password}`;
  const encoded =
    typeof btoa === "function"
      ? btoa(credentials)
      : Buffer.from(credentials).toString("base64");

  return `Basic ${encoded}`;
}

async function clickhouseRequest(
  query: string,
  params: Record<string, string> = {},
) {
  const response = await fetch(clickhouseEndpoint(params), {
    body: query,
    headers: {
      authorization: basicAuthorization(),
      "content-type": "text/plain; charset=utf-8",
    },
    method: "POST",
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(
      `ClickHouse usage protection failed (${response.status}): ${details}`,
    );
  }

  return response;
}

async function ensureUsageTable() {
  if (!usageTableReady) {
    usageTableReady = (async () => {
      await (
        await clickhouseRequest("CREATE DATABASE IF NOT EXISTS gatewise")
      ).text();
      await (
        await clickhouseRequest(`
          CREATE TABLE IF NOT EXISTS gatewise.chat_usage_events
          (
            event_id UUID,
            event_type Enum8('session_start' = 1, 'model_turn' = 2),
            subject String,
            chat_id String,
            event_key String,
            occurred_at DateTime64(3) DEFAULT now64(3)
          )
          ENGINE = MergeTree
          ORDER BY (event_type, subject, occurred_at, event_id)
          TTL toDateTime(occurred_at) + INTERVAL 7 DAY DELETE
        `)
      ).text();
      await (
        await clickhouseRequest(`
          ALTER TABLE gatewise.chat_usage_events
          ADD COLUMN IF NOT EXISTS event_key String DEFAULT toString(event_id)
        `)
      ).text();
    })().catch((error) => {
      usageTableReady = undefined;
      throw error;
    });
  }

  await usageTableReady;
}

async function recordUsageEvent(
  eventType: UsageEventType,
  subject: string,
  chatId: string,
  eventKey: string,
) {
  await ensureUsageTable();

  const eventId = globalThis.crypto.randomUUID();
  const event = JSON.stringify({
    chat_id: chatId,
    event_id: eventId,
    event_key: eventKey,
    event_type: eventType,
    subject,
  });

  await (
    await clickhouseRequest(
      `INSERT INTO gatewise.chat_usage_events FORMAT JSONEachRow\n${event}`,
    )
  ).text();

  for (const delay of VISIBILITY_POLL_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const [visibility] = await readRows<{ event_count: string | number }>(
      `
        SELECT count() AS event_count
        FROM gatewise.chat_usage_events
        WHERE event_id = {eventId:UUID}
      `,
      { eventId },
    );

    if (Number(visibility?.event_count ?? 0) > 0) {
      return;
    }
  }

  throw new Error("ClickHouse usage protection could not confirm the event.");
}

async function readRows<T>(
  query: string,
  params: Record<string, string>,
) {
  const response = await clickhouseRequest(`${query}\nFORMAT JSON`, params);
  const payload = (await response.json()) as { data?: T[] };
  return payload.data ?? [];
}

export async function claimPublicChatSessionStart(
  visitorHash: string,
  chatId: string,
) {
  await ensureUsageTable();
  const eventKey = `session:${chatId}`;

  const readSessionCounts = async () => {
    const [counts] = await readRows<{
      current_count: string | number;
      global_count: string | number;
      visitor_count: string | number;
    }>(
      `
        SELECT
          countIf(event_key = {eventKey:String}) AS current_count,
          uniqExactIf(event_key, subject = {visitorHash:String}) AS visitor_count,
          uniqExact(event_key) AS global_count
        FROM gatewise.chat_usage_events
        WHERE event_type = 'session_start'
          AND occurred_at >= toStartOfInterval(
            now(),
            INTERVAL ${SESSION_WINDOW_MINUTES} MINUTE
          )
      `,
      { eventKey, visitorHash },
    );

    return {
      currentCount: Number(counts?.current_count ?? 0),
      globalCount: Number(counts?.global_count ?? 0),
      visitorCount: Number(counts?.visitor_count ?? 0),
    };
  };
  const before = await readSessionCounts();

  if (before.currentCount > 0) {
    return;
  }

  if (
    before.visitorCount >= MAX_VISITOR_SESSIONS_PER_WINDOW ||
    before.globalCount >= MAX_GLOBAL_SESSIONS_PER_WINDOW
  ) {
    throw new Error(
      "The live demo is temporarily at its session limit. Try again in 30 minutes.",
    );
  }

  await recordUsageEvent(
    "session_start",
    visitorHash,
    chatId,
    eventKey,
  );

  const after = await readSessionCounts();

  if (
    after.visitorCount > MAX_VISITOR_SESSIONS_PER_WINDOW ||
    after.globalCount > MAX_GLOBAL_SESSIONS_PER_WINDOW
  ) {
    throw new Error(
      "The live demo is temporarily at its session limit. Try again in 30 minutes.",
    );
  }
}

export async function claimChatModelTurn(
  chatId: string,
  runId: string,
  turn: number,
) {
  await recordUsageEvent(
    "model_turn",
    chatId,
    chatId,
    `model:${runId}:${turn}`,
  );

  const [counts] = await readRows<{ turn_count: string | number }>(
    `
      SELECT uniqExact(event_key) AS turn_count
      FROM gatewise.chat_usage_events
      WHERE event_type = 'model_turn'
        AND chat_id = {chatId:String}
    `,
    { chatId },
  );
  const turnCount = Number(counts?.turn_count ?? 0);

  if (turnCount > MAX_MODEL_TURNS_PER_CHAT) {
    throw new Error(
      "This demo session has reached its six-message limit. Refresh to start a new session.",
    );
  }
}
