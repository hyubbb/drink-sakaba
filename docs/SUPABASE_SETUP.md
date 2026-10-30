# Supabase setup for drink-sakaba (souka 酒場)

This document is written for an agent (or person) setting up the backend. It covers everything the
app needs from Supabase and Vercel. Do the steps in order and report the results listed under
"Hand back" at the end.

## What the app uses

- **Supabase Realtime only.** Broadcast + Presence on channels named `sakaba:shop-1` … `sakaba:shop-9`.
- **No database tables, no Storage, no Edge Functions** in phase 1. Nothing is persisted.
- Phase 2 (optional, anti-abuse): **Anonymous Sign-ins** + **private channels** with RLS policies on `realtime.messages`.

Traffic design (already implemented in `lib/net/`):

| Kind | Used for | When it is sent |
| --- | --- | --- |
| Presence | nickname, language, colour, seat, seat timestamp | enter, sit, stand, language change |
| Broadcast `mv` | position while walking | 5 times per second, only while moving |
| Broadcast `st` | glass level, shared plate state, resting position | on change, when someone joins, every 20 s |
| Broadcast `ev` | drink, pour, eat, cheer, phrase | once per action |

A shop holds 16 people (`SHOP_CAPACITY` in `lib/game/constants.ts`). When `shop-N` is full the client joins `shop-N+1`.

---

## Phase 1 — public channels (required)

### 1. Create the project

- Supabase dashboard → New project.
- Name: `drink-sakaba`.
- Region: **Northeast Asia (Seoul)**. Most players are in Korea and Japan; Tokyo is an equally good choice. Pick one and do not change it later.
- Database password: generate one and store it in a password manager. The app never uses it.
- Plan: Free is fine for testing.

### 2. Realtime settings

Dashboard → **Realtime → Settings** (`/dashboard/project/<ref>/realtime/settings`):

- **Allow public access: ON** for phase 1. (Phase 2 turns it off.)
- Leave other limits at their defaults.

No "Enable Realtime" toggle on tables is needed: the app does not use Postgres Changes.

### 3. Collect the keys

Dashboard → **Project Settings → API** (or **API Keys**):

- **Project URL**, e.g. `https://abcd1234.supabase.co`
- **Publishable key** (`sb_publishable_...`). If the project only shows legacy keys, use the **anon** key instead.

Do **not** copy the `service_role` / secret key anywhere in this project. The app never needs it.

### 4. Vercel

1. Vercel → Add New → Project → import GitHub repo `hyubbb/drink-sakaba`. Framework preset: Next.js (auto-detected). No build settings to change.
2. Project → Settings → Environment Variables, for **Production, Preview and Development**:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 3 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (or anon) key from step 3 |
   | `NEXT_PUBLIC_SAKABA_PRIVATE_CHANNELS` | `0` |

   Do not set `NEXT_PUBLIC_SAKABA_NET` in Vercel (it is a local-testing switch).
3. Redeploy (Deployments → … → Redeploy). `NEXT_PUBLIC_` variables are baked in at build time, so a redeploy is required after any change.

### 5. Verify

1. Open the deployed URL in two different browsers (or one normal + one private window).
2. Enter with two nicknames. The sign at the top left must show **"1호점 · 손님 2명"** in both. If it says "혼자 모드", the env vars are missing or wrong.
3. Sit across from each other at the same table (side a ↔ side b). Pour from one; the other's glass must fill and a toast must appear.
4. Dashboard → **Realtime → Inspector**: join channel `sakaba:shop-1` and confirm `mv` / `st` / `ev` broadcast messages and presence entries appear.
5. Optional: Dashboard → **Reports / Usage → Realtime** to watch peak connections and messages.

---

## Phase 2 — private channels with anonymous sign-in (optional, do after phase 1 works)

Do this when random clients start abusing the public channels. It ties every connection to a Supabase
anonymous user, so channels can be locked down and users rate-limited or banned later.

### 1. Enable anonymous sign-ins

Dashboard → **Authentication → Sign In / Providers** → enable **Allow anonymous sign-ins**.

Recommended alongside it: **Authentication → Attack Protection → CAPTCHA** (Cloudflare Turnstile or hCaptcha). If you enable CAPTCHA, tell the app owner: the client must then pass a captcha token to `signInAnonymously()` (not implemented yet).

### 2. RLS policies on `realtime.messages`

Run in **SQL Editor**. Anonymous users have the `authenticated` role, so `to authenticated` covers them.
RLS is already enabled on `realtime.messages`; do **not** run `alter table ... enable row level security` (it fails with 42501).

```sql
-- Receive broadcast and presence on sakaba shop channels
create policy "sakaba: read shop channels"
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) like 'sakaba:shop-%'
  and realtime.messages.extension in ('broadcast', 'presence')
);

-- Send broadcast and track presence on sakaba shop channels
create policy "sakaba: write shop channels"
on realtime.messages
for insert
to authenticated
with check (
  (select realtime.topic()) like 'sakaba:shop-%'
  and realtime.messages.extension in ('broadcast', 'presence')
);
```

### 3. Turn off public access

Dashboard → **Realtime → Settings** → **Allow public access: OFF**.

### 4. Switch the app

Vercel env: `NEXT_PUBLIC_SAKABA_PRIVATE_CHANNELS=1` → redeploy.

The client then calls `supabase.auth.signInAnonymously()` (once per browser; the session is persisted),
passes the JWT to Realtime, and joins channels with `config.private = true` (see `lib/net/supabaseRoom.ts`).

### 5. Verify

Repeat the phase 1 verification. Additionally, in **Authentication → Users** you should see anonymous users appear.
A client with `NEXT_PUBLIC_SAKABA_PRIVATE_CHANNELS=0` must now fail to join (the app falls back to solo mode).

---

## Limits to keep in mind

Free plan Realtime limits (project-wide), from Supabase docs:

| | Free | Pro |
| --- | --- | --- |
| Concurrent connections | 200 | 500 |
| Messages per second | 100 | 500 |
| Presence messages per second | 20 | 50 |
| Channel joins per second | 100 | 500 |

A message delivered to N clients counts as N messages. Rough load for one full shop (12 seated):
about 30 messages/s while drinking and talking, plus about 50–60/s for each person walking around.
The Free plan therefore suits one busy shop; plan for Pro before several shops are open at once.
Exceeding the per-second limit disconnects clients briefly; supabase-js reconnects on its own.

Knobs in `lib/game/constants.ts` if usage runs high: `MOVE_HZ` (walking updates), `STATE_HEARTBEAT_MS`, `SHOP_CAPACITY`.

## Never do

- Never expose the `service_role` / secret key (no `NEXT_PUBLIC_` variable, no client code).
- Never add database tables or Postgres Changes for this feature; the protocol is designed to be stateless.
- Never rename the channel prefix `sakaba:shop-` without updating both the RLS policies and `lib/net/supabaseRoom.ts`.

## Hand back

Report to the app owner:

1. Project ref and region.
2. That the three Vercel env vars are set (do not paste the key values into chat).
3. The deployed URL.
4. Result of the two-browser verification (shop sign text, pour worked or not).
5. Whether phase 2 was done.
