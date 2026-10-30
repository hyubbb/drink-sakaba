# Supabase setup for drink-sakaba (souka 酒場)

This document is written for an agent (or person) setting up the backend. It covers everything the
app needs from Supabase and Vercel. Do the steps in order and report the results listed under
"Hand back" at the end.

## What the app uses

- **Supabase Realtime only.** Broadcast + Presence on two levels of channels:
  - venue channels `sakaba:<venue>:ch-<n>` — venue is `izakaya` or `pocha`, n is 1–5 (10 channels in total)
  - table channels `sakaba:<venue>:ch-<n>:t1` / `:t2` — only the people seated at that table
- **No database tables, no Storage, no Edge Functions** in phase 1. Nothing is persisted.
- Phase 2 (optional, anti-abuse): **Anonymous Sign-ins** + **private channels** with RLS policies on `realtime.messages`.

Traffic design (already implemented in `lib/net/`):

| Kind | Channel | Used for | When it is sent |
| --- | --- | --- | --- |
| Presence | venue | nickname, language, colour, seat, seat timestamp | enter, sit, stand, language change |
| Broadcast `mv` | venue | position of people standing | 5 times per second while walking, once on stop, once (spread over ~2.5 s) when someone joins |
| Broadcast `ev` (say) | venue | phrases said while standing | once per phrase |
| Broadcast `st` | table | glass level, shared plate state | on change, when someone sits at the table (spread over ~1.5 s), every 20 s |
| Broadcast `ev` | table | drink, pour, eat, cheer, phrase | once per action |

A channel holds 16 people (`CHANNEL_CAPACITY` in `lib/game/constants.ts`). Players can pick a channel in the
top-left sign; otherwise the client takes the first of ch-1 … ch-5 with room. Moving between izakaya and pocha
leaves one venue channel and joins the other.

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
2. Enter with two nicknames. The sign at the top left must show **"1채널 · 손님 2명"** in both. If it says "혼자 모드", the env vars are missing or wrong.
3. Sit across from each other at the same table (side a ↔ side b). Pour from one; the other's glass must fill and a toast must appear.
4. Dashboard → **Realtime → Inspector**: join channel `sakaba:izakaya:ch-1` and confirm presence entries and `mv` messages appear; join `sakaba:izakaya:ch-1:t1` while two people sit at table 1 and confirm `st` / `ev` messages appear.
5. Switch one browser to 포차 with the button in the sign: the other browser's count must drop to 1.
6. Optional: Dashboard → **Reports / Usage → Realtime** to watch peak connections and messages.

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
-- Receive broadcast and presence on sakaba venue and table channels
create policy "sakaba: read channels"
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) like 'sakaba:%'
  and realtime.messages.extension in ('broadcast', 'presence')
);

-- Send broadcast and track presence on sakaba venue and table channels
create policy "sakaba: write channels"
on realtime.messages
for insert
to authenticated
with check (
  (select realtime.topic()) like 'sakaba:%'
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

A message delivered to N clients likely counts as N messages. Table actions reach at most 5 other
people (the rest of the table), so seated play costs roughly 1.5–2 messages/s per person.
Rough totals: one full channel (16 people, mostly seated) ≈ 30 messages/s, plus about 75/s for each
person walking at that moment. 100 people spread over the channels ≈ 150–200 messages/s.
The Free plan suits testing and one or two busy channels; plan for Pro before traffic grows beyond that.
Exceeding the per-second limit disconnects clients briefly; supabase-js reconnects on its own.

Knobs in `lib/game/constants.ts` if usage runs high: `MOVE_HZ` (walking updates), `STATE_HEARTBEAT_MS`, `CHANNEL_CAPACITY`, `CHANNEL_COUNT`.

## Never do

- Never expose the `service_role` / secret key (no `NEXT_PUBLIC_` variable, no client code).
- Never add database tables or Postgres Changes for this feature; the protocol is designed to be stateless.
- Never rename the channel prefix `sakaba:` without updating both the RLS policies and `lib/net/supabaseRoom.ts`.

## Hand back

Report to the app owner:

1. Project ref and region.
2. That the three Vercel env vars are set (do not paste the key values into chat).
3. The deployed URL.
4. Result of the two-browser verification (sign text, pour worked or not, venue switch worked or not).
5. Whether phase 2 was done.
