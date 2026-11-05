"use client";

import { VENUES, VENUE_INFO, type Venue } from "@/lib/game/constants";
import type { Engine, Snapshot } from "@/lib/game/engine";
import { UI } from "@/lib/game/i18n";
import { ChannelPicker } from "./ChannelPicker";

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
          <ChannelPicker
            lang={snap.lang}
            current={channel}
            counts={snap.net.counts}
            disabled={mode === "connecting"}
            onPick={(ch) => onGo(snap.venue, ch)}
          />
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
