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

const supportedAirports = new Set(
  AIRPORTS.map((airport) => airport.code as string),
);

const airportAdviceTool = tool({
  description:
    "Query ClickHouse OnTime history and calculate the visual airport arrival recommendation. Call this exactly once when the origin airport, travel date, and scheduled departure time are known.",
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
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Departure date in YYYY-MM-DD format"),
    departureTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .describe("Scheduled local departure time in 24-hour HH:mm format"),
  }),
  execute: async ({ origin, travelDate, departureTime }) => {
    logger.info("Gatewise agent is querying ClickHouse", {
      origin,
      travelDate,
      departureTime,
    });

    return calculateAirportAdvice({
      origin,
      travelDate,
      departureTime,
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
    maxDuration: 120,
    idleTimeoutInSeconds: 30,
    run: async ({ messages, tools, signal }) => {
      const today = new Date().toISOString().slice(0, 10);
      const airportList = AIRPORTS.map(
        (airport) => `${airport.code} (${airport.city})`,
      ).join(", ");

      return streamText({
        ...chat.toStreamTextOptions({ tools }),
        model: google("gemini-3.5-flash"),
        messages,
        abortSignal: signal,
        stopWhen: stepCountIs(4),
        system: `
You are Gatewise, a concise airport arrival assistant.
Today is ${today} UTC.

Your job is to turn a traveller's natural-language question into one visual recommendation backed by ClickHouse.

Rules:
- Supported origin airports are: ${airportList}.
- You need an origin airport, departure date, and scheduled local departure time.
- Resolve relative dates such as "tomorrow" against today's date.
- If one required value is missing or ambiguous, ask one short clarifying question.
- Once all three values are known, you MUST call analyzeAirport exactly once. Never invent, estimate, or calculate the result yourself.
- After the tool returns, answer with at most one short sentence telling the user that the visual analysis is ready.
- Match the user's language.
- Never claim the result includes live security queues, road traffic, check-in queues, or airline cut-off times.
- Do not return tables, lists, or a wall of text. The interactive visual is the product.
        `.trim(),
      });
    },
  });
