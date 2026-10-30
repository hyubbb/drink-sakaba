"use client";

import { useEffect } from "react";
import { VENUES, VENUE_INFO, type Venue } from "@/lib/game/constants";
import type { Snapshot } from "@/lib/game/engine";
import { UI } from "@/lib/game/i18n";

/** Shown when the player walks out through the entrance: pick the next place to drink. */
export function VenuePicker({ snap, onPick, onStay }: { snap: Snapshot; onPick: (v: Venue) => void; onStay: () => void }) {
  const T = UI[snap.lang];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Escape") onStay(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStay]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="doorTitle">
      <div className="picker">
        <h2 id="doorTitle">{T.doorTitle}</h2>
        <div className="venues">
          {VENUES.map((v) => (
            <button key={v} type="button" className={"venueCard " + v + (v === snap.venue ? " here" : "")} onClick={() => onPick(v)} autoFocus={v !== snap.venue}>
              <b>{VENUE_INFO[v][snap.lang]}</b>
              <span>{T.venueDesc[v]}</span>
              {v === snap.venue && <em>{T.doorHere}</em>}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={onStay}>
          {T.doorStay}
        </button>
      </div>
    </div>
  );
}
