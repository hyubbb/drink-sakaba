import "server-only";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { VENUES } from "../game/constants";

/**
 * People in the bar right now, read from the venue lobbies (`sakaba:<venue>:lobby`), where every
 * player tracks `{ ch }` in presence. Only real players are counted: the practice bot never joins
 * Realtime. The server listens without tracking, so it never counts itself.
 */

const CACHE_MS = 60_000;
let cache: { at: number; value: number } | null = null;
let inflight: Promise<number> | null = null;

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function countLobby(sb: SupabaseClient, venue: string, isPrivate: boolean, waitMs: number) {
  return new Promise<number>((resolve) => {
    let ch: RealtimeChannel | null = null;
    let done = false;
    const finish = (n: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (ch) void sb.removeChannel(ch);
      resolve(n);
    };
    const count = () => (ch ? Object.keys(ch.presenceState()).length : 0);
    // no sync within waitMs: report what we have (0 if the lobby never answered)
    const timer = setTimeout(() => finish(count()), waitMs);
    ch = sb.channel(`sakaba:${venue}:lobby`, { config: { private: isPrivate } });
    ch.on("presence", { event: "sync" }, () => finish(count()));
    ch.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") finish(0);
    });
  });
}

async function measure(): Promise<number> {
  const sb = client();
  if (!sb) return 0;
  const isPrivate = process.env.NEXT_PUBLIC_SAKABA_PRIVATE_CHANNELS === "1";
  try {
    if (isPrivate) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      if (data.session) await sb.realtime.setAuth(data.session.access_token);
    }
    const counts = await Promise.all(VENUES.map((v) => countLobby(sb, v, isPrivate, 4000)));
    return counts.reduce((a, b) => a + b, 0);
  } finally {
    sb.realtime.disconnect();
  }
}

/** Current headcount, cached for a minute so frequent polls do not open a socket each time. */
export async function currentHeadcount(): Promise<number> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  inflight ??= measure()
    .then((value) => {
      cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
