import { runs } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import type { airportArrivalAdvisor } from "@/trigger/airport-arrival-advisor";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { runId } = await context.params;

  if (!/^run_[A-Za-z0-9]+/.test(runId)) {
    return NextResponse.json({ error: "Invalid run ID." }, { status: 400 });
  }

  try {
    const run = await runs.retrieve<typeof airportArrivalAdvisor>(runId);

    if (run.isSuccess) {
      return NextResponse.json({
        status: run.status,
        completed: true,
        output: run.output,
      });
    }

    if (run.isFailed) {
      return NextResponse.json({
        status: run.status,
        completed: true,
        error:
          run.error?.message ??
          "The analysis task failed. Check the Trigger.dev run.",
      });
    }

    return NextResponse.json({
      status: run.status,
      completed: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not retrieve task run.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
