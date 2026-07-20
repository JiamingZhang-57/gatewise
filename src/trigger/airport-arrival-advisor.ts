import { logger, task } from "@trigger.dev/sdk";

import type {
  AirportAdvicePayload,
  AirportAdviceResult,
} from "@/lib/airport-advice";
import { calculateAirportAdvice } from "@/lib/calculate-airport-advice";

export const airportArrivalAdvisor = task({
  id: "airport-arrival-advisor",
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 8_000,
    factor: 2,
    randomize: true,
  },
  run: async (
    payload: AirportAdvicePayload,
  ): Promise<AirportAdviceResult> => {
    logger.info("Calculating airport arrival advice", {
      origin: payload.origin,
      travelDate: payload.travelDate,
      departureTime: payload.departureTime,
    });

    const result = await calculateAirportAdvice({
      origin: payload.origin,
      travelDate: payload.travelDate,
      departureTime: payload.departureTime,
    });

    logger.info("Arrival recommendation calculated", {
      origin: result.origin,
      crowdPercentile: result.crowdPercentile,
      recommendedMinutes: result.recommendedMinutes,
      riskLevel: result.riskLevel,
    });

    return result;
  },
});
