#!/usr/bin/env node
/**
 * metamoa (https://metamoa.com) registration and space API, run from your own machine.
 *
 *   node scripts/metamoa.mjs submit --agree      register the site (once)
 *   node scripts/metamoa.mjs status              review result of the submission
 *   node scripts/metamoa.mjs live [count]        push the visitor count (default: read the site's /api/live)
 *   node scripts/metamoa.mjs update "text"       post a news line (once per 24 h)
 *   node scripts/metamoa.mjs event add --title "..." --start 2026-11-07T20:00:00+09:00 --end 2026-11-07T23:00:00+09:00 [--desc ..] [--from HH:MM --to HH:MM] [--url ..]
 *   node scripts/metamoa.mjs event list | event rm <event_id>
 *   node scripts/metamoa.mjs character <file.glb|file.png>   put a character in the camp
 *   node scripts/metamoa.mjs character                         show its review status
 *
 * Secrets never print. `submit` writes METAMOA_SUBMISSION_ID, METAMOA_REQUEST_KEY and
 * METAMOA_WEBHOOK_SECRET into .env.local (git-ignored); the space key goes there as METAMOA_KEY
 * by hand after the owner check. Copy the same values into Vercel → Settings → Environment Variables.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const API = "https://metamoa.com/api";
const ENV_FILE = resolve(process.cwd(), ".env.local");

/* ---------------- .env.local ---------------- */

function readEnvFile() {
  const env = {};
  if (!existsSync(ENV_FILE)) return env;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const fileEnv = readEnvFile();
const env = (k) => process.env[k] || fileEnv[k] || "";

function saveEnv(values) {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  writeFileSync(ENV_FILE, text, { mode: 0o600 });
}

/* ---------------- helpers ---------------- */

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(`--${name}`);
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const SECRET_KEYS = /^(request_key|secret|key|space_key|token)$/i;
const redact = (v) =>
  Array.isArray(v) ? v.map(redact) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEYS.test(k) ? "(hidden)" : redact(x)]))
    : v;
const show = (v) => console.log(JSON.stringify(redact(v), null, 2));

async function api(method, path, { key, json, raw, type } = {}) {
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (raw !== undefined) { headers["Content-Type"] = type; body = raw; }
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function spaceCreds() {
  const key = env("METAMOA_KEY"), space = env("METAMOA_SPACE_ID");
  if (!key || !space) die("METAMOA_KEY and METAMOA_SPACE_ID are not set. Do the owner check at https://metamoa.com/owner first (docs/METAMOA.md).");
  return { key, space: encodeURIComponent(space) };
}

/* ---------------- commands ---------------- */

async function submit() {
  if (!has("agree")) die("Pass --agree to confirm you accept https://metamoa.com/terms and https://metamoa.com/privacy.");
  if (env("METAMOA_REQUEST_KEY") && !has("force")) die("Already submitted (METAMOA_REQUEST_KEY is in .env.local). Use `status`, or --force to submit again.");
  const site = (flag("url") || env("METAMOA_SITE_URL") || "https://drink-sakaba.vercel.app/").replace(/\/?$/, "/");
  if (!/^https:\/\//.test(site)) die("The site URL must be https.");

  // metamoa opens the URL during submission and rejects it with 422 if it does not load
  const page = await fetch(site).catch((e) => ({ ok: false, status: String(e) }));
  if (!page.ok) die(`${site} did not open (${page.status}). Deploy first.`);
  const live = await fetch(`${site}api/live`).then((r) => r.text()).catch(() => "");
  const liveOk = /^\s*\d+\s*$/.test(live);
  if (!liveOk) console.warn(`! ${site}api/live did not return a number; live_api is left out.`);

  const email = flag("email") || env("METAMOA_EMAIL");
  const body = {
    name: flag("name") || "드링크사카바",
    url: site,
    region: "kr",
    api_hookup: true,
    agree: true,
    summary: flag("summary") || "모르는 사람과 마주 앉아 한 잔씩 따라주는 온라인 혼술집",
    langs: ["ko", "ja"],
    webhook_url: `${site}api/metamoa/webhook`,
    ...(liveOk ? { live_api: `${site}api/live` } : {}),
    ...(email ? { email, notify_email: true } : {}),
  };
  if ([...body.summary].length > 60) die("summary is longer than 60 characters.");

  const r = await api("POST", "/submit", { json: body });
  if (r.status !== 201) { console.error(`✗ submit failed (${r.status})`); show(r.data); process.exit(1); }
  const d = r.data;
  saveEnv({
    METAMOA_SUBMISSION_ID: d.id,
    METAMOA_REQUEST_KEY: d.request_key,
    ...(d.webhook?.secret ? { METAMOA_WEBHOOK_SECRET: d.webhook.secret } : {}),
  });
  console.log(`✓ submitted: id ${d.id}`);
  console.log(`  status page: ${d.status_url ?? `${API}/submit/${d.id}`}`);
  console.log("  saved to .env.local: METAMOA_SUBMISSION_ID, METAMOA_REQUEST_KEY" + (d.webhook?.secret ? ", METAMOA_WEBHOOK_SECRET" : ""));
  console.log("  next: add METAMOA_WEBHOOK_SECRET to Vercel env and redeploy so the review result can reach /api/metamoa/webhook.");
}

async function status() {
  const id = env("METAMOA_SUBMISSION_ID"), key = env("METAMOA_REQUEST_KEY");
  if (!id || !key) die("No submission in .env.local. Run `submit --agree` first.");
  const r = await api("GET", `/submit/${encodeURIComponent(id)}`, { key });
  console.log(`HTTP ${r.status}`);
  show(r.data);
  if (r.ok) console.log(`\nWhen approved: owner check at https://metamoa.com/owner?id=${id}`);
}

async function live() {
  const { key, space } = spaceCreds();
  let count = args[1] !== undefined ? Number(args[1]) : NaN;
  if (!Number.isFinite(count)) {
    const site = (env("METAMOA_SITE_URL") || "https://drink-sakaba.vercel.app/").replace(/\/?$/, "/");
    count = Number((await fetch(`${site}api/live`).then((r) => r.text())).trim());
  }
  if (!Number.isInteger(count) || count < 0) die("count must be a whole number ≥ 0");
  const r = await api("POST", `/live/${space}`, { key, json: { count } });
  r.ok ? console.log(`✓ live count ${count} sent`) : (console.error(`✗ ${r.status}`), show(r.data));
}

async function update() {
  const { key, space } = spaceCreds();
  const text = args.slice(1).join(" ").trim();
  if (!text) die('usage: update "text"');
  if ([...text].length > 200 || text.split("\n").length > 3) die("text must be ≤ 200 characters and ≤ 3 lines");
  const r = await api("POST", `/update/${space}`, { key, json: { text } });
  r.ok ? console.log("✓ update posted") : (console.error(`✗ ${r.status}`), show(r.data));
}

async function event() {
  const { key, space } = spaceCreds();
  const sub = args[1];
  if (sub === "list") return show((await api("GET", `/space/${space}/events`, { key })).data);
  if (sub === "rm") {
    const id = args[2] || die("usage: event rm <event_id>");
    const r = await api("DELETE", `/space/${space}/events/${encodeURIComponent(id)}`, { key });
    return r.ok ? console.log("✓ event removed") : (console.error(`✗ ${r.status}`), show(r.data));
  }
  if (sub === "add") {
    const e = {
      title: flag("title") || die("--title is required"),
      starts_at: flag("start") || die("--start is required (ISO 8601 with offset, e.g. 2026-11-07T20:00:00+09:00)"),
      ends_at: flag("end") || die("--end is required"),
      ...(flag("desc") ? { desc: flag("desc") } : {}),
      ...(flag("from") && flag("to") ? { daily_from: flag("from"), daily_to: flag("to") } : {}),
      ...(flag("url") ? { url: flag("url") } : {}),
    };
    const r = await api("POST", `/space/${space}/events`, { key, json: e });
    return r.status === 201 ? (console.log("✓ event created"), show(r.data)) : (console.error(`✗ ${r.status}`), show(r.data));
  }
  die("usage: event add|list|rm");
}

async function character() {
  const { key, space } = spaceCreds();
  const file = args[1];
  if (!file) return show((await api("GET", `/space/${space}/character`, { key })).data);
  const ext = extname(file).toLowerCase();
  const type = ext === ".glb" ? "model/gltf-binary" : ext === ".png" ? "image/png" : die("character must be a .glb or .png file");
  const raw = readFileSync(file);
  const limit = ext === ".glb" ? 4 : 1;
  if (raw.length > limit * 1024 * 1024) die(`${ext} must be ≤ ${limit} MB`);
  const r = await api("PUT", `/space/${space}/character`, { key, raw, type });
  r.status === 202 ? (console.log("✓ uploaded, metamoa is checking it"), show(r.data)) : (console.error(`✗ ${r.status}`), show(r.data));
}

const commands = { submit, status, live, update, event, character };
const run = commands[args[0]];
if (!run) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(2, 15).map((l) => l.replace(/^ \* ?/, "")).join("\n"));
  process.exit(args[0] ? 1 : 0);
}
await run();
