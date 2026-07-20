"use server";

import { createHmac, timingSafeEqual } from "node:crypto";

import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";
import { cookies, headers } from "next/headers";

import { claimPublicChatSessionStart } from "@/lib/chat-usage-limit";
import {
  chatIdSchema,
  chatStartInputSchema,
} from "@/lib/public-access-policy";
import type { airportChat } from "@/trigger/airport-chat";

const CHAT_ACCESS_COOKIE = "gatewise_chat_access";
const CHAT_ACCESS_MAX_AGE_SECONDS = 30 * 60;

const startChatSession = chat.createStartSessionAction<typeof airportChat>(
  "airport-arrival-chat",
  {
    tokenTTL: "15m",
    triggerConfig: {
      machine: "small-1x",
      maxAttempts: 1,
      maxDuration: 600,
    },
  },
);

function getCookieSecret() {
  const secret =
    process.env.GATEWISE_SESSION_SECRET ?? process.env.TRIGGER_SECRET_KEY;

  if (!secret || secret.length < 16) {
    throw new Error("Gatewise session protection is unavailable.");
  }

  return secret;
}

function signChatId(chatId: string) {
  return createHmac("sha256", getCookieSecret())
    .update(`gatewise-chat:${chatId}`)
    .digest("base64url");
}

function createChatCookieValue(chatId: string) {
  return `${chatId}.${signChatId(chatId)}`;
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function cookieMatchesChatId(value: string | undefined, chatId: string) {
  if (!value) {
    return false;
  }

  const separatorIndex = value.lastIndexOf(".");

  if (separatorIndex < 1) {
    return false;
  }

  const cookieChatId = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);

  if (cookieChatId !== chatId) {
    return false;
  }

  const expected = signChatId(chatId);

  return signaturesMatch(signature, expected);
}

async function getVisitorHash() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0];
  const address =
    requestHeaders.get("cf-connecting-ip") ??
    forwardedFor?.trim() ??
    `unknown:${requestHeaders.get("user-agent") ?? "unknown"}`;

  return createHmac("sha256", getCookieSecret())
    .update(`gatewise-visitor:${address.slice(0, 500)}`)
    .digest("hex");
}

export async function startAirportChatSession(input: unknown) {
  const parsed = chatStartInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error("Invalid chat session request.");
  }

  await claimPublicChatSessionStart(
    await getVisitorHash(),
    parsed.data.chatId,
  );

  const result = await startChatSession({
    chatId: parsed.data.chatId,
    clientData: parsed.data.clientData,
  });
  const cookieStore = await cookies();

  cookieStore.set(
    CHAT_ACCESS_COOKIE,
    createChatCookieValue(parsed.data.chatId),
    {
      httpOnly: true,
      maxAge: CHAT_ACCESS_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    },
  );

  return result;
}

export async function mintAirportChatAccessToken(input: unknown) {
  const parsed = chatIdSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error("Invalid chat session.");
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(CHAT_ACCESS_COOKIE)?.value;

  if (!cookieMatchesChatId(cookieValue, parsed.data)) {
    throw new Error("This chat session has expired. Refresh to start again.");
  }

  return auth.createPublicToken({
    scopes: {
      read: { sessions: parsed.data },
      write: { sessions: parsed.data },
    },
    expirationTime: "15m",
  });
}
