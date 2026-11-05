import { verifyWebhook } from "@/lib/server/metamoa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Review result from metamoa: `submission.approved` or `submission.rejected`, signed with
 * X-Metamoa-Signature (HMAC-SHA256 of the raw body, key = METAMOA_WEBHOOK_SECRET).
 * The result is written to the server log (Vercel → Logs); nothing else is stored.
 */
export async function POST(req: Request) {
  const secret = process.env.METAMOA_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 503 });
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-metamoa-signature"), secret)) {
    return new Response("bad signature", { status: 401 });
  }
  let event: { type?: string; event?: string; id?: string; data?: { id?: string; status?: string } } = {};
  try {
    event = JSON.parse(raw);
  } catch {
    /* signed but not JSON: still acknowledge */
  }
  const type = event.type ?? event.event ?? "unknown";
  const id = event.id ?? event.data?.id ?? "?";
  console.log(`[metamoa] ${type} submission=${id}${event.data?.status ? ` status=${event.data.status}` : ""}`);
  return Response.json({ ok: true });
}
