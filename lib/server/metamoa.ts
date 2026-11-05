import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-side client for the metamoa space API (https://metamoa.com/api).
 * The space key lives only in the server environment as METAMOA_KEY; it is never sent to the browser.
 */

const BASE = "https://metamoa.com/api";

function creds() {
  const key = process.env.METAMOA_KEY;
  const space = process.env.METAMOA_SPACE_ID;
  if (!key || !space) throw new Error("METAMOA_KEY and METAMOA_SPACE_ID must be set on the server");
  return { key, space: encodeURIComponent(space) };
}

async function call(method: string, path: string, body?: unknown) {
  const { key } = creds();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`metamoa ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as unknown) : null;
}

/** 4) Concurrent visitors. Send at most every 10 minutes; metamoa refuses a resend within 9. */
export function pushLive(count: number) {
  const n = Math.max(0, Math.min(100000, Math.round(count)));
  return call("POST", `/live/${creds().space}`, { count: n });
}

/** News line: once per 24 h, 200 characters, 3 lines, links to our own site only. */
export function postUpdate(text: string) {
  return call("POST", `/update/${creds().space}`, { text });
}

export type MetamoaEvent = {
  title: string; // ≤ 30 chars
  desc?: string; // ≤ 40 chars, no links
  starts_at: string; // ISO 8601 with offset
  ends_at: string;
  daily_from?: string; // "HH:MM" KST, with daily_to
  daily_to?: string;
  url?: string; // same site only
};
export const createEvent = (e: MetamoaEvent) => call("POST", `/space/${creds().space}/events`, e);
export const listEvents = () => call("GET", `/space/${creds().space}/events`);
export const deleteEvent = (id: string) => call("DELETE", `/space/${creds().space}/events/${encodeURIComponent(id)}`);

/**
 * Check X-Metamoa-Signature: HMAC-SHA256 of the raw request body with the webhook secret.
 * The docs do not pin the encoding, so hex (optionally "sha256="-prefixed) and base64 are accepted.
 */
export function verifyWebhook(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const mac = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = signature.trim().replace(/^sha256=/i, "");
  for (const candidate of [Buffer.from(given, "hex"), Buffer.from(given, "base64")]) {
    if (candidate.length === mac.length && timingSafeEqual(candidate, mac)) return true;
  }
  return false;
}
