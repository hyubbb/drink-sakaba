import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export const usePrivateChannels = () => process.env.NEXT_PUBLIC_SAKABA_PRIVATE_CHANNELS === "1";

/** Browser Supabase client, or null when the env vars are missing (the game then runs in solo mode). */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }
  client = createClient(url, key, {
    auth: { persistSession: usePrivateChannels(), autoRefreshToken: usePrivateChannels() },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
