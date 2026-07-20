"use client";

import { useChat } from "@ai-sdk/react";
import {
  type InferChatUIMessage,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react";
import { useEffect, useMemo, useState } from "react";

import {
  mintAirportChatAccessToken,
  startAirportChatSession,
} from "@/app/actions";
import { DOMESTIC_GUIDANCE_SOURCES } from "@/lib/airport-advice";
import type {
  AirportAdviceResult,
  HourlyAirportStat,
} from "@/lib/airport-advice";
import type { airportChat } from "@/trigger/airport-chat";

type GatewiseMessage = InferChatUIMessage<typeof airportChat>;

function getBrowserDateContext() {
  const now = new Date();
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }

      return parts;
    }, {});

  return {
    localDate: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    timeZone,
  };
}

const SAMPLE_HOURLY: HourlyAirportStat[] = Array.from(
  { length: 24 },
  (_, hour) => {
    const morning = 24 * Math.exp(-Math.pow((hour - 8) / 3.4, 2));
    const evening = 19 * Math.exp(-Math.pow((hour - 17) / 4, 2));
    const averageFlights = 5 + morning + evening;

    return {
      hour,
      averageFlights: Number(averageFlights.toFixed(1)),
      busyDayFlights: Math.round(averageFlights * 1.25),
      delayedPercent: Math.round(12 + Math.max(0, hour - 13) * 0.8),
      cancelledPercent: Number((0.4 + Math.max(0, hour - 16) * 0.1).toFixed(1)),
      sampleDays: 39,
    };
  },
);

const SAMPLE_RESULT: AirportAdviceResult = {
  origin: "JFK",
  city: "New York, NY",
  travelDate: "2026-07-21",
  departureTime: "09:00",
  flightScope: "us-domestic",
  checkedBag: false,
  tsaPrecheck: true,
  dayOfWeek: 2,
  dayLabel: "Tuesday",
  arrivalTime: "06:30",
  arrivalDate: "2026-07-21",
  officialGuidelineTime: "07:00",
  officialGuidelineDate: "2026-07-21",
  recommendedMinutes: 150,
  timingBreakdown: {
    officialBaselineMinutes: 120,
    checkedBagBufferMinutes: 0,
    crowdBufferMinutes: 30,
    tsaPrecheckAdjustmentMinutes: 0,
  },
  crowdBufferMinutes: 30,
  crowdPercentile: 88,
  riskLevel: "moderate",
  selectedHour: SAMPLE_HOURLY[9],
  hourly: SAMPLE_HOURLY,
  dataWindow: "Preview - ask Gatewise for live data",
  rulesCheckedOn: "2026-07-20",
  caveat:
    "The 120-minute domestic baseline follows official guidance. Checked-bag and historical activity buffers are Gatewise estimates. PreCheck is expedited but not guaranteed, so no fixed time is deducted. Verify airline cut-offs and live airport conditions.",
};

function formatDate(date: string) {
  if (!date) return "Choose a date";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getMessageText(message: GatewiseMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getLatestAdvice(messages: GatewiseMessage[]) {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];

      if (
        part.type === "tool-analyzeAirport" &&
        part.state === "output-available"
      ) {
        return part.output;
      }
    }
  }

  return undefined;
}

function AirportPulseChart({
  data,
  selectedHour,
}: {
  data: HourlyAirportStat[];
  selectedHour: number;
}) {
  const [hoveredHour, setHoveredHour] = useState(selectedHour);

  useEffect(() => {
    setHoveredHour(selectedHour);
  }, [selectedHour]);

  const width = 760;
  const height = 250;
  const left = 42;
  const right = 18;
  const top = 28;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const yMax = Math.max(...data.map((item) => item.averageFlights), 1) * 1.15;
  const xFor = (hour: number) => left + (hour / 23) * chartWidth;
  const yFor = (value: number) =>
    top + chartHeight - (value / yMax) * chartHeight;
  const line = data
    .map(
      (item, index) =>
        `${index === 0 ? "M" : "L"} ${xFor(item.hour)} ${yFor(item.averageFlights)}`,
    )
    .join(" ");
  const area = `${line} L ${xFor(data[data.length - 1].hour)} ${top + chartHeight} L ${xFor(data[0].hour)} ${top + chartHeight} Z`;
  const hovered =
    data.find((item) => item.hour === hoveredHour) ??
    data.find((item) => item.hour === selectedHour) ??
    data[0];
  const tooltipX = Math.min(Math.max(xFor(hovered.hour) - 62, 8), width - 132);

  return (
    <div className="pulse-chart">
      <div className="chart-heading">
        <div>
          <span className="eyebrow">AIRPORT PULSE</span>
          <h3>Flights moving through the day</h3>
        </div>
        <div className="chart-legend">
          <span>
            <i className="legend-dot load" /> flight load
          </span>
          <span>
            <i className="legend-dot flight" /> your flight
          </span>
        </div>
      </div>

      <svg
        role="img"
        aria-label="Hourly airport flight volume"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f6ff75" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f6ff75" stopOpacity="0" />
          </linearGradient>
          <filter id="chart-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={left}
            x2={width - right}
            y1={top + chartHeight * ratio}
            y2={top + chartHeight * ratio}
            className="grid-line"
          />
        ))}

        <path d={area} fill="url(#area-fill)" />
        <path d={line} className="pulse-line" />

        {data.map((item) => {
          const x = xFor(item.hour);
          const isSelected = item.hour === selectedHour;

          return (
            <g
              key={item.hour}
              onMouseEnter={() => setHoveredHour(item.hour)}
              onFocus={() => setHoveredHour(item.hour)}
              tabIndex={0}
              aria-label={`${item.hour}:00, ${item.averageFlights} average flights`}
              className="chart-hour"
            >
              <rect
                x={x - chartWidth / 48}
                y={top}
                width={chartWidth / 24}
                height={chartHeight}
                fill="transparent"
              />
              {isSelected && (
                <>
                  <line
                    x1={x}
                    x2={x}
                    y1={top - 5}
                    y2={top + chartHeight}
                    className="flight-marker-line"
                  />
                  <circle
                    cx={x}
                    cy={yFor(item.averageFlights)}
                    r="6"
                    className="flight-marker"
                    filter="url(#chart-glow)"
                  />
                </>
              )}
            </g>
          );
        })}

        {[0, 6, 12, 18, 23].map((hour) => (
          <text
            key={hour}
            x={xFor(hour)}
            y={height - 10}
            textAnchor={hour === 0 ? "start" : hour === 23 ? "end" : "middle"}
            className="axis-label"
          >
            {String(hour).padStart(2, "0")}:00
          </text>
        ))}

        <g transform={`translate(${tooltipX}, 4)`}>
          <rect width="124" height="54" rx="10" className="chart-tooltip" />
          <text x="12" y="20" className="tooltip-time">
            {String(hovered.hour).padStart(2, "0")}:00
          </text>
          <text x="12" y="39" className="tooltip-detail">
            {hovered.averageFlights} avg flights
          </text>
        </g>
      </svg>
    </div>
  );
}

function JourneyTimeline({ result }: { result: AirportAdviceResult }) {
  return (
    <div className="journey">
      <div className="journey-line">
        <span className="journey-progress" />
        <span className="journey-node active" />
        <span className="journey-node guideline" />
        <span className="journey-node gate" />
      </div>
      <div className="journey-labels">
        <div>
          <strong>{result.arrivalTime}</strong>
          <span>Comfort target</span>
        </div>
        <div>
          <strong>{result.officialGuidelineTime}</strong>
          <span>Official 2h line</span>
        </div>
        <div>
          <strong>{result.departureTime}</strong>
          <span>Departure</span>
        </div>
      </div>
    </div>
  );
}

function AdvicePanel({
  result,
  preview,
  busy,
}: {
  result: AirportAdviceResult;
  preview: boolean;
  busy: boolean;
}) {
  const departureHour = Number(result.departureTime.slice(0, 2));
  const busyLabel =
    result.crowdPercentile >= 80
      ? "Peak window"
      : result.crowdPercentile >= 50
        ? "Steady traffic"
        : "Quieter window";

  return (
    <section className="answer-panel">
      <div className="answer-topline">
        <span className={`live-badge ${preview ? "preview" : ""}`}>
          <i />
          {preview ? "PREVIEW" : "LIVE ANALYSIS"}
        </span>
        <span className="data-window">
          U.S. domestic · {result.dataWindow}
        </span>
      </div>

      <div className="verdict-grid">
        <div className="verdict">
          <p>DATA-INFORMED ARRIVAL WINDOW</p>
          <div className="arrival-window">
            <span className="arrival-time">{result.arrivalTime}</span>
            <span className="window-arrow">→</span>
            <span className="guideline-time">
              {result.officialGuidelineTime}
            </span>
          </div>
          <div className="arrival-context">
            <span>
              {result.arrivalDate === result.officialGuidelineDate
                ? formatDate(result.arrivalDate)
                : `${formatDate(result.arrivalDate)} → ${formatDate(
                    result.officialGuidelineDate,
                  )}`}
            </span>
            <span className="context-separator" />
            <span>{result.origin}</span>
          </div>
        </div>

        <div className="verdict-metrics">
          <div className="metric-card">
            <span>Buffer</span>
            <strong>{formatMinutes(result.recommendedMinutes)}</strong>
            <small>before departure</small>
          </div>
          <div className="metric-card accent">
            <span>Crowd level</span>
            <strong>{result.crowdPercentile}<sup>th</sup></strong>
            <small>percentile</small>
          </div>
        </div>
      </div>

      <JourneyTimeline result={result} />

      <div className="timing-breakdown">
        <div className="breakdown-heading">
          <div>
            <span className="eyebrow">WHY THIS WINDOW</span>
            <strong>Every minute is visible</strong>
          </div>
          <span>{formatMinutes(result.recommendedMinutes)} total</span>
        </div>
        <div className="breakdown-grid">
          <div className="breakdown-card official">
            <span>Official baseline</span>
            <strong>
              {result.timingBreakdown.officialBaselineMinutes}m
            </strong>
            <small>TSA + airline guidance</small>
          </div>
          <div className="breakdown-card">
            <span>Checked bag</span>
            <strong>
              +{result.timingBreakdown.checkedBagBufferMinutes}m
            </strong>
            <small>
              {result.checkedBag ? "handling margin" : "carry-on only"}
            </small>
          </div>
          <div className="breakdown-card accent">
            <span>Historical pressure</span>
            <strong>+{result.timingBreakdown.crowdBufferMinutes}m</strong>
            <small>ClickHouse activity proxy</small>
          </div>
          <div className="breakdown-card">
            <span>TSA PreCheck</span>
            <strong>
              {result.timingBreakdown.tsaPrecheckAdjustmentMinutes}m
            </strong>
            <small>
              {result.tsaPrecheck
                ? "noted, never guaranteed"
                : "standard screening"}
            </small>
          </div>
        </div>
      </div>

      <div className="explanation-strip">
        <div className="strip-icon">↗</div>
        <div>
          <strong>{busyLabel}</strong>
          <p>
            {String(departureHour).padStart(2, "0")}:00 averages{" "}
            {result.selectedHour.averageFlights} scheduled departures. The
            historical pressure signal adds {result.crowdBufferMinutes} minutes
            without moving the official two-hour guideline later.
          </p>
        </div>
        <span className={`risk-pill ${result.riskLevel}`}>
          {result.riskLevel} disruption risk
        </span>
      </div>

      <AirportPulseChart
        data={result.hourly}
        selectedHour={departureHour}
      />

      <div className="evidence-row">
        <div>
          <span>15+ min delays</span>
          <strong>{result.selectedHour.delayedPercent}%</strong>
        </div>
        <div>
          <span>Cancellations</span>
          <strong>{result.selectedHour.cancelledPercent}%</strong>
        </div>
        <div>
          <span>Historical days</span>
          <strong>{result.selectedHour.sampleDays}</strong>
        </div>
        <p>
          {result.caveat}
          <span className="rules-date">
            Rules checked {result.rulesCheckedOn}
          </span>
          <span className="guidance-links">
            {DOMESTIC_GUIDANCE_SOURCES.map((source) => (
              <a
                href={source.url}
                key={source.url}
                rel="noreferrer"
                target="_blank"
              >
                {source.label}
              </a>
            ))}
          </span>
        </p>
      </div>

      {busy && (
        <div className="analysis-overlay">
          <span className="spinner" />
          <strong>Trigger.dev agent is querying ClickHouse</strong>
          <small>Gemini is translating your question into a typed tool call</small>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const clientDateContext = useMemo(getBrowserDateContext, []);
  const transport = useTriggerChatTransport<typeof airportChat>({
    task: "airport-arrival-chat",
    accessToken: ({ chatId }) => mintAirportChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startAirportChatSession({ chatId, clientData }),
    clientData: clientDateContext,
  });
  const { messages, sendMessage, stop, status, error } =
    useChat<GatewiseMessage>({ transport });
  const [question, setQuestion] = useState(
    "I have a U.S. domestic flight from JFK tomorrow at 09:00. Carry-on only, and I have TSA PreCheck. When should I arrive?",
  );
  const liveResult = useMemo(() => getLatestAdvice(messages), [messages]);
  const result = liveResult ?? SAMPLE_RESULT;
  const isPreview = liveResult === undefined;
  const isBusy = status === "submitted" || status === "streaming";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();

    if (!text || isBusy) {
      return;
    }

    setQuestion("");
    void sendMessage({ text });
  }

  return (
    <main className="shell">
      <header className="site-header">
        <a className="brand" href="#">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>GATEWISE</span>
        </a>
        <div className="system-status">
          <span><i className="status-dot clickhouse" /> ClickHouse</span>
          <span><i className="status-dot trigger" /> Trigger.dev chat.agent</span>
          <span className="prototype-tag">HACKATHON PROTOTYPE</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="conversation">
          <div className="conversation-heading">
            <span className="eyebrow">LIVE AGENT SESSION</span>
            <h1>Skip the airport guesswork.</h1>
            <p>
              Ask naturally. Gatewise combines official U.S. domestic guidance,
              your travel setup, and historical airport pressure.
            </p>
          </div>

          <div className="chat-thread" aria-live="polite">
            {messages.length === 0 && (
              <div className="agent-message">
                <span className="agent-avatar">G</span>
                <div>
                  <strong>Where and when are you flying?</strong>
                  <p>
                    Include the date and time, confirm it is U.S. domestic, and
                    tell me about checked bags and TSA PreCheck.
                  </p>
                </div>
              </div>
            )}

            {messages.map((message) => {
              const text = getMessageText(message);
              const toolPart = message.parts.find(
                (part) => part.type === "tool-analyzeAirport",
              );

              if (!text && !toolPart) {
                return null;
              }

              return (
                <div
                  className={`chat-message ${message.role}`}
                  key={message.id}
                >
                  <span className="message-avatar">
                    {message.role === "assistant" ? "G" : "Y"}
                  </span>
                  <div className="message-body">
                    <span className="message-role">
                      {message.role === "assistant" ? "Gatewise" : "You"}
                    </span>
                    {text && <p>{text}</p>}
                    {toolPart && (
                      <span
                        className={`tool-chip ${
                          toolPart.state === "output-available" ? "complete" : ""
                        }`}
                      >
                        <i />
                        {toolPart.state === "output-available"
                          ? "ClickHouse visual ready"
                          : "Querying ClickHouse"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <form className="chat-composer" onSubmit={handleSubmit}>
            <label className="question-box">
              <span className="sr-only">Ask Gatewise</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="e.g. JFK tomorrow at 09:00, U.S. domestic, one checked bag, no PreCheck"
                rows={3}
                disabled={isBusy}
              />
            </label>

            <div className="prompt-examples">
              <button
                type="button"
                onClick={() =>
                  setQuestion(
                    "I fly from LAX next Tuesday at 18:30 on a U.S. domestic flight. I will check one bag and do not have TSA PreCheck. When should I arrive?",
                  )
                }
                disabled={isBusy}
              >
                LAX · checked bag · no PreCheck
              </button>
              <button
                type="button"
                onClick={() =>
                  setQuestion(
                    "How early should I arrive at ORD for a U.S. domestic 07:15 flight tomorrow? Carry-on only, with TSA PreCheck.",
                  )
                }
                disabled={isBusy}
              >
                ORD · carry-on · PreCheck
              </button>
            </div>

            <div className="composer-actions">
              <button
                className="analyse-button"
                type="submit"
                disabled={isBusy || !question.trim()}
              >
                {isBusy ? (
                  <>
                    <span className="spinner dark" /> Agent is working
                  </>
                ) : (
                  <>
                    Ask Gatewise <span>→</span>
                  </>
                )}
              </button>
              {isBusy && (
                <button className="stop-button" type="button" onClick={stop}>
                  Stop
                </button>
              )}
            </div>
          </form>

          {error && (
            <div className="error-message">
              <strong>The agent couldn’t finish</strong>
              <p>{error.message}</p>
              <small>
                Make sure both <code>pnpm trigger:dev</code> and{" "}
                <code>pnpm dev</code> are running.
              </small>
            </div>
          )}

          <div className="source-note">
            <span>ORCHESTRATION + DATA</span>
            <p>
              Trigger.dev chat.agent translates the question into a typed
              ClickHouse query over U.S. OnTime records. U.S. domestic only.
            </p>
          </div>
        </aside>

        <AdvicePanel result={result} preview={isPreview} busy={isBusy} />
      </div>
    </main>
  );
}
