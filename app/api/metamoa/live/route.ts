import { currentHeadcount } from "@/lib/server/headcount";
import { pushLive } from "@/lib/server/metamoa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push the visitor count to metamoa (POST /api/live/{space_id}).
 * Call every 10 minutes from a scheduler with `Authorization: Bearer $CRON_SECRET`
 * (.github/workflows/metamoa-live.yml does this). Vercel Cron sends the same header when CRON_SECRET is set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!process.env.METAMOA_KEY || !process.env.METAMOA_SPACE_ID) {
    return new Response("metamoa not configured", { status: 503 });
  }
  const count = await currentHeadcount();
  try {
    await pushLive(count);
    return Response.json({ ok: true, count });
  } catch (e) {
    // a resend inside metamoa's 9-minute window is refused; report it without failing loudly
    return Response.json({ ok: false, count, error: String(e).slice(0, 200) }, { status: 502 });
  }
}
