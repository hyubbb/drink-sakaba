"use client";

import type { Engine, Snapshot } from "@/lib/game/engine";
import { UI } from "@/lib/game/i18n";

export function TopBar({ snap, engine }: { snap: Snapshot; engine: Engine }) {
  const T = UI[snap.lang];
  const { mode, people, shop } = snap.net;
  const text = mode === "live" ? T.live(people, shop) : mode === "solo" ? T.solo : mode === "offline" ? T.offline : T.connecting;
  return (
    <div className="top">
      <div className="sign">
        <b>souka 酒場</b>
        <small>
          <span className={"dot" + (mode === "live" ? " on" : "")} />
          {text}
        </small>
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
