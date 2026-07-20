import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import type { AirportAdvicePayload } from "@/lib/airport-advice";
import type { airportArrivalAdvisor } from "@/trigger/airport-arrival-advisor";

function isValidPayload(value: unknown): value is AirportAdvicePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<AirportAdvicePayload>;

  return Boolean(
    typeof payload.question === "string" &&
      typeof payload.origin === "string" &&
      /^[A-Za-z]{3}$/.test(payload.origin) &&
      typeof payload.travelDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.travelDate) &&
      typeof payload.departureTime === "string" &&
      /^\d{2}:\d{2}$/.test(payload.departureTime),
  );
}

export async function POST(request: Request) {
  const payload: unknown = await request.json();

  if (!isValidPayload(payload)) {
    return NextResponse.json(
      { error: "Please provide a valid airport, date and departure time." },
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
