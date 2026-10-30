"use client";

import { CHANNEL_COUNT, VENUES, VENUE_INFO, type Venue } from "@/lib/game/constants";
import type { Engine, Snapshot } from "@/lib/game/engine";
import { UI } from "@/lib/game/i18n";

export function TopBar({ snap, engine, onGo }: { snap: Snapshot; engine: Engine; onGo: (venue: Venue, channel: number | null) => void }) {
  const T = UI[snap.lang];
  const { mode, people, channel } = snap.net;
  const text = mode === "live" ? T.live(people, channel) : mode === "solo" ? T.solo : mode === "offline" ? T.offline : T.connecting;
  const other = VENUES.find((v) => v !== snap.venue)!;
  return (
    <div className="top">
      <div className="sign">
        <b>{VENUE_INFO[snap.venue].sign}</b>
        <small>
          <span className={"dot" + (mode === "live" ? " on" : "")} />
          {text}
        </small>
        <div className="signRow">
          <button className="miniBtn" type="button" onClick={() => onGo(other, null)}>
            {T.switchTo(VENUE_INFO[other][snap.lang])}
          </button>
          <label className="chSelect">
            <span className="sr">{T.channelAuto}</span>
            <select
              id="channel"
              value={channel || ""}
              onChange={(e) => onGo(snap.venue, Number(e.target.value))}
              disabled={mode === "connecting"}
            >
              {!channel && <option value="">{T.channelAuto}</option>}
              {Array.from({ length: CHANNEL_COUNT }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {T.channel(n)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="topBtns">
        <button className="iconBtn" type="button" onClick={() => engine.setLang(snap.lang === "ko" ? "ja" : "ko")}>
          {snap.lang === "ko" ? "KO" : "JA"}
        </button>
        <button className="iconBtn" type="button" onClick={() => engine.toggleMute()}>
          {snap.muted ? "♪ off" : "♪"}
        </button>
      </div>
    </div>
  );
}
