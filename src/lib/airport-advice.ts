import type { TimingBreakdown } from "@/lib/recommendation-model";

export type AirportAdviceInput = {
  origin: string;
  travelDate: string;
  departureTime: string;
  flightScope: "us-domestic";
  checkedBag: boolean;
  tsaPrecheck: boolean;
};

export type AirportAdvicePayload = AirportAdviceInput & {
  question: string;
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
  flightScope: "us-domestic";
  checkedBag: boolean;
  tsaPrecheck: boolean;
  dayOfWeek: number;
  dayLabel: string;
  arrivalTime: string;
  arrivalDate: string;
  officialGuidelineTime: string;
  officialGuidelineDate: string;
  recommendedMinutes: number;
  timingBreakdown: TimingBreakdown;
  crowdBufferMinutes: number;
  crowdPercentile: number;
  riskLevel: "low" | "moderate" | "high";
  selectedHour: HourlyAirportStat;
  hourly: HourlyAirportStat[];
  dataWindow: string;
  rulesCheckedOn: string;
  caveat: string;
};

export const DOMESTIC_GUIDANCE_SOURCES = [
  {
    label: "TSA travel tips",
    url: "https://www.tsa.gov/news/press/factsheets/tsa-travel-tips",
  },
  {
    label: "American check-in guidance",
    url: "https://www.aa.com/i18n/travel-info/check-in-and-arrival.jsp?locale=en_US",
  },
  {
    label: "Delta check-in guidance",
    url: "https://www.delta.com/us/en/check-in-security/check-in-time-requirements/domestic-check-in",
  },
] as const;

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
