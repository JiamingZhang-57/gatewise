import { google } from "@ai-sdk/google";
import { logger } from "@trigger.dev/sdk";
import {
  chat,
  type InferChatUIMessageFromTools,
} from "@trigger.dev/sdk/ai";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

import { AIRPORTS } from "@/lib/airport-advice";
import { calculateAirportAdvice } from "@/lib/calculate-airport-advice";
import { isValidCalendarDate } from "@/lib/recommendation-model";

const supportedAirports = new Set(
  AIRPORTS.map((airport) => airport.code as string),
);

const airportAdviceTool = tool({
  description:
    "Query ClickHouse OnTime history and calculate the visual U.S. domestic airport arrival recommendation. Call this exactly once when the origin, date, time, domestic scope, checked-bag status, and TSA PreCheck status are all explicitly known.",
  inputSchema: z.object({
    origin: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .refine((value) => supportedAirports.has(value), {
        message: `Supported airports: ${AIRPORTS.map((airport) => airport.code).join(", ")}`,
      })
      .describe("Three-letter IATA origin airport code"),
    travelDate: z
      .string()
      .refine(isValidCalendarDate, {
        message: "Use a real calendar date in YYYY-MM-DD format",
      })
      .describe("Departure date in YYYY-MM-DD format"),
    departureTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .describe("Scheduled local departure time in 24-hour HH:mm format"),
    flightScope: z
      .literal("us-domestic")
      .describe("Explicit confirmation that this is a U.S. domestic flight"),
    checkedBag: z
      .boolean()
      .describe("Whether the traveller will check a bag"),
    tsaPrecheck: z
      .boolean()
      .describe(
        "Whether the traveller explicitly said TSA PreCheck; CLEAR alone does not count",
      ),
  }),
  execute: async ({
    origin,
    travelDate,
    departureTime,
    flightScope,
    checkedBag,
    tsaPrecheck,
  }) => {
    logger.info("Gatewise agent is querying ClickHouse", {
      origin,
      travelDate,
      departureTime,
      flightScope,
      checkedBag,
      tsaPrecheck,
    });

    return calculateAirportAdvice({
      origin,
      travelDate,
      departureTime,
      flightScope,
      checkedBag,
      tsaPrecheck,
    });
  },
});

const airportTools = {
  analyzeAirport: airportAdviceTool,
};

export type AirportChatMessage = InferChatUIMessageFromTools<
  typeof airportTools
>;

export const airportChat = chat
  .withUIMessage<AirportChatMessage>()
  .agent({
    id: "airport-arrival-chat",
    tools: airportTools,
    clientDataSchema: z.object({
      localDate: z
        .string()
        .refine(isValidCalendarDate, {
          message: "Use the traveller's local date in YYYY-MM-DD format",
        }),
      timeZone: z.string().min(1).max(100),
    }),
    // A chat can span several user turns, so allow the session to stay active.
    maxDuration: 3600,
    idleTimeoutInSeconds: 30,
    run: async ({ messages, tools, signal, clientData }) => {
      const airportList = AIRPORTS.map(
        (airport) => `${airport.code} (${airport.city})`,
      ).join(", ");
      const dateContext = clientData
        ? `The traveller's current local date is ${clientData.localDate} in the ${clientData.timeZone} IANA timezone.`
        : "No trusted local date is available. Ask for an absolute YYYY-MM-DD departure date instead of resolving relative dates.";

      return streamText({
        ...chat.toStreamTextOptions({ tools }),
        model: google("gemini-3.5-flash"),
        messages,
        abortSignal: signal,
        stopWhen: stepCountIs(4),
        system: `
You are Gatewise, a concise airport arrival assistant.
${dateContext}

Your job is to turn a traveller's natural-language question into one visual recommendation backed by ClickHouse.

Rules:
- Gatewise currently supports U.S. domestic departures only. Origin alone does not prove a flight is domestic.
- Supported origin airports are: ${airportList}.
- You need six explicit facts: origin airport, departure date, scheduled local departure time, confirmation that the flight is U.S. domestic, whether the traveller will check a bag, and whether they have TSA PreCheck.
- Resolve relative dates such as "tomorrow" only when the trusted traveller-local date is available above; otherwise ask for an absolute date.
- Never guess checked-bag or TSA PreCheck status. CLEAR alone is not TSA PreCheck.
- If any required values are missing or ambiguous, ask one short combined question covering every missing fact.
- If the user says the flight is international, do not call the tool. Briefly explain the current U.S. domestic scope.
- Once all six values are known, you MUST call analyzeAirport exactly once. Never invent, estimate, or calculate the result yourself.
- After the tool returns, answer with at most one short sentence telling the user that the visual analysis is ready.
- Match the user's language.
- Never claim the result includes live security queues, road traffic, check-in queues, or carrier-specific cut-off times.
- Do not return tables, lists, or a wall of text. The interactive visual is the product.
        `.trim(),
      });
    },
  });
