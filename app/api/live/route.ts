import { currentHeadcount } from "@/lib/server/headcount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Current visitor count as a bare number, for metamoa's `live_api` field.
 * Counts everyone in both venues and every channel.
 */
export async function GET() {
  const n = await currentHeadcount().catch(() => 0);
  return new Response(String(n), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
}
