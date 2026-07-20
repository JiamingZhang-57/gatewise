import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import {
  AIRPORTS,
  type AirportAdvicePayload,
} from "@/lib/airport-advice";
import { isValidCalendarDate } from "@/lib/recommendation-model";
import type { airportArrivalAdvisor } from "@/trigger/airport-arrival-advisor";

const supportedAirports = new Set(
  AIRPORTS.map((airport) => airport.code as string),
);

function isValidPayload(value: unknown): value is AirportAdvicePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<AirportAdvicePayload>;

  return Boolean(
      typeof payload.question === "string" &&
      typeof payload.origin === "string" &&
      supportedAirports.has(payload.origin.trim().toUpperCase()) &&
      typeof payload.travelDate === "string" &&
      isValidCalendarDate(payload.travelDate) &&
      typeof payload.departureTime === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(payload.departureTime) &&
      payload.flightScope === "us-domestic" &&
      typeof payload.checkedBag === "boolean" &&
      typeof payload.tsaPrecheck === "boolean",
  );
}

export async function POST(request: Request) {
  const payload: unknown = await request.json();

  if (!isValidPayload(payload)) {
    return NextResponse.json(
      {
        error:
          "Please provide a valid U.S. domestic airport, date, departure time, checked-bag status and TSA PreCheck status.",
      },
      { status: 400 },
    );
  }

  const handle = await tasks.trigger<typeof airportArrivalAdvisor>(
    "airport-arrival-advisor",
    {
      ...payload,
      origin: payload.origin.toUpperCase(),
    },
  );

  return NextResponse.json({ runId: handle.id }, { status: 202 });
}
