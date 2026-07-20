import assert from "node:assert/strict";
import test from "node:test";

import {
  assertChatMessageHistoryAllowed,
  chatStartInputSchema,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_TURNS,
  validateIncomingChatMessages,
} from "../src/lib/public-access-policy";

const validStartInput = {
  chatId: "safe_chat_1234",
  clientData: {
    localDate: "2026-07-20",
    timeZone: "Europe/London",
  },
};

test("chat start input accepts only the documented fields", () => {
  assert.equal(chatStartInputSchema.safeParse(validStartInput).success, true);
  assert.equal(
    chatStartInputSchema.safeParse({
      ...validStartInput,
      triggerConfig: { machine: "large-2x" },
    }).success,
    false,
  );
  assert.equal(
    chatStartInputSchema.safeParse({
      ...validStartInput,
      metadata: { admin: true },
    }).success,
    false,
  );
});

test("chat start input rejects invalid IDs, dates and timezones", () => {
  assert.equal(
    chatStartInputSchema.safeParse({
      ...validStartInput,
      chatId: "../../unsafe",
    }).success,
    false,
  );
  assert.equal(
    chatStartInputSchema.safeParse({
      ...validStartInput,
      clientData: {
        ...validStartInput.clientData,
        localDate: "2026-02-30",
      },
    }).success,
    false,
  );
  assert.equal(
    chatStartInputSchema.safeParse({
      ...validStartInput,
      clientData: {
        ...validStartInput.clientData,
        timeZone: "Not/A_Timezone",
      },
    }).success,
    false,
  );
});

test("incoming chat validation accepts the text boundaries", () => {
  assert.doesNotThrow(() =>
    validateIncomingChatMessages(
      [{ role: "user", parts: [{ type: "text", text: "JFK tomorrow?" }] }],
      0,
    ),
  );
  assert.doesNotThrow(() =>
    validateIncomingChatMessages(
      [
        {
          role: "user",
          parts: [{ type: "text", text: "x".repeat(MAX_CHAT_MESSAGE_LENGTH) }],
        },
      ],
      MAX_CHAT_TURNS - 1,
    ),
  );
});

test("incoming chat validation rejects oversized, non-text and extra turns", () => {
  assert.throws(() =>
    validateIncomingChatMessages(
      [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "x".repeat(MAX_CHAT_MESSAGE_LENGTH + 1),
            },
          ],
        },
      ],
      0,
    ),
  );
  assert.throws(() =>
    validateIncomingChatMessages(
      [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: `${" ".repeat(MAX_CHAT_MESSAGE_LENGTH)}x`,
            },
          ],
        },
      ],
      0,
    ),
  );
  assert.throws(() =>
    validateIncomingChatMessages(
      [
        {
          role: "user",
          parts: [{ type: "file", url: "https://example.com/file" }],
        },
      ],
      0,
    ),
  );
  assert.throws(() =>
    validateIncomingChatMessages(
      [{ role: "user", parts: [{ type: "text", text: "One more" }] }],
      MAX_CHAT_TURNS,
    ),
  );
});

test("accumulated chat history enforces the cap across continuation runs", () => {
  assert.doesNotThrow(() =>
    assertChatMessageHistoryAllowed(
      Array.from({ length: MAX_CHAT_TURNS }, (_, index) => ({
        id: `user-${index}`,
        role: "user",
      })),
    ),
  );
  assert.throws(() =>
    assertChatMessageHistoryAllowed(
      Array.from({ length: MAX_CHAT_TURNS + 1 }, (_, index) => ({
        id: `user-${index}`,
        role: "user",
      })),
    ),
  );
});
