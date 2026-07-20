export type AirportAdvicePayload = {
  question: string;
  origin: string;
  travelDate: string;
  departureTime: string;
};

export type HourlyAirportStat = {
  hour: number;
  averageFlights: number;
  busyDayFlights: number;
  delayedPercent: number;
  cancelledPercent: number;
  sampleDays: number;
};

export type AirportAdviceResult = {
  origin: string;
  city: string;
  travelDate: string;
  departureTime: string;
  dayOfWeek: number;
  dayLabel: string;
  arrivalTime: string;
  arrivalDate: string;
  recommendedMinutes: number;
  baselineMinutes: number;
  crowdBufferMinutes: number;
  crowdPercentile: number;
  riskLevel: "low" | "moderate" | "high";
  selectedHour: HourlyAirportStat;
  hourly: HourlyAirportStat[];
  dataWindow: string;
  caveat: string;
};

export const AIRPORTS = [
  { code: "ATL", city: "Atlanta" },
  { code: "BOS", city: "Boston" },
  { code: "DFW", city: "Dallas/Fort Worth" },
  { code: "DEN", city: "Denver" },
  { code: "EWR", city: "Newark" },
  { code: "JFK", city: "New York" },
  { code: "LAX", city: "Los Angeles" },
  { code: "LAS", city: "Las Vegas" },
  { code: "MCO", city: "Orlando" },
  { code: "MIA", city: "Miami" },
  { code: "ORD", city: "Chicago" },
  { code: "SEA", city: "Seattle" },
  { code: "SFO", city: "San Francisco" },
] as const;
