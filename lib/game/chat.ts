/** Free chat: only the people at the same table see it. Short lines, no translation. */

export const CHAT_MAX = 30;
export const CHAT_COOLDOWN_MS = 10_000;
/** Receivers drop a line from someone who spoke again sooner than this (a modified client). */
export const CHAT_MIN_GAP_MS = 9_000;

// control, zero-width and bidi-override characters that can hide or reorder text
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|kr|jp|io|me|co|link|xyz|app|gg|ly)(?:\/\S*)?/gi;
// phone numbers and similar long digit runs (010-1234-5678, 090 1234 5678, +82...)
const PHONE = /\+?\d[\d\s.-]{7,}\d/g;
// messenger handles people use to move a chat elsewhere
const HANDLE = /(?:카톡|카카오톡|오픈채팅|라인|line|kakao|insta|인스타|텔레그램|telegram)\s*(?:id|아이디)?\s*[:：]?\s*@?[\w.]{3,}/gi;

/**
 * Clean a line for the bubble: strip invisible characters, collapse spaces, mask links,
 * phone numbers and messenger IDs, and cut to CHAT_MAX characters.
 * Both sender and receivers run this, so a modified client cannot skip it.
 * Returns "" when nothing is left to say.
 */
export function cleanChat(input: unknown): string {
  if (typeof input !== "string") return "";
  const text = input
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LINK, "***")
    .replace(PHONE, "***")
    .replace(HANDLE, "***");
  return [...text].slice(0, CHAT_MAX).join("").trim();
}
