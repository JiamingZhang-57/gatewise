import { z } from "zod";

import { isValidCalendarDate } from "./recommendation-model";

export const MAX_CHAT_MESSAGE_LENGTH = 600;
export const MAX_CHAT_TURNS = 6;

export function isValidIanaTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const chatIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const chatClientDataSchema = z
  .object({
    localDate: z.string().refine(isValidCalendarDate, {
      message: "Use a real local date in YYYY-MM-DD format",
    }),
    timeZone: z.string().min(1).max(100).refine(isValidIanaTimeZone, {
      message: "Use a valid IANA timezone",
    }),
  })
  .strict();

export const chatStartInputSchema = z
  .object({
    chatId: chatIdSchema,
    clientData: chatClientDataSchema,
  })
  .strict();

export function assertChatTurnAllowed(turn: number) {
  if (!Number.isInteger(turn) || turn < 0 || turn >= MAX_CHAT_TURNS) {
    throw new Error(
      "This demo session has reached its six-message limit. Refresh to start a new session.",
    );
  }
}

export function assertChatMessageHistoryAllowed(messages: readonly unknown[]) {
  let userMessageCount = 0;

  for (const message of messages) {
    if (
      message &&
      typeof message === "object" &&
      (message as { role?: unknown }).role === "user"
    ) {
      userMessageCount += 1;
    }
  }

  if (userMessageCount < 1 || userMessageCount > MAX_CHAT_TURNS) {
    throw new Error(
      "This demo session has reached its six-message limit. Refresh to start a new session.",
    );
  }
}

export function validateIncomingChatMessages(
  messages: readonly unknown[],
  turn: number,
) {
  assertChatTurnAllowed(turn);

  if (messages.length !== 1) {
    throw new Error("Send one text question at a time.");
  }

  const message = messages[0];

  if (!message || typeof message !== "object") {
    throw new Error("Invalid chat message.");
  }

  const candidate = message as {
    role?: unknown;
    parts?: unknown;
  };

  if (candidate.role !== "user" || !Array.isArray(candidate.parts)) {
    throw new Error("Only traveller text questions are accepted.");
  }

  let text = "";

  for (const part of candidate.parts) {
    if (
      !part ||
      typeof part !== "object" ||
      (part as { type?: unknown }).type !== "text" ||
      typeof (part as { text?: unknown }).text !== "string"
    ) {
      throw new Error("Only text questions are accepted.");
    }

    text += (part as { text: string }).text;
  }

  const trimmed = text.trim();

  if (
    !trimmed ||
    text.length > MAX_CHAT_MESSAGE_LENGTH ||
    trimmed.length > MAX_CHAT_MESSAGE_LENGTH
  ) {
    throw new Error(
      `Keep each question between 1 and ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
    );
  }
}
