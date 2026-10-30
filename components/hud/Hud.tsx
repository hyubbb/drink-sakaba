"use client";

import { useEffect, useState } from "react";
import type { Engine, Snapshot } from "@/lib/game/engine";
import { UI } from "@/lib/game/i18n";
import { PhraseSheet } from "./PhraseSheet";

function Cup({ level, full }: { level: number; full: number }) {
  return (
    <span className="cup">
      {Array.from({ length: full }, (_, i) => full - i).map((n) => (
        <i key={n} className={level >= n ? "f" : ""} />
      ))}
    </span>
  );
}

export function Hud({ snap, engine }: { snap: Snapshot; engine: Engine }) {
  const T = UI[snap.lang];
  const [sheet, setSheet] = useState(false);

  // T toggles the phrase sheet, Escape closes it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "KeyT" && !e.repeat) setSheet((s) => !s);
      if (e.code === "Escape") setSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const talk = (
    <button className="btn" type="button" onClick={() => setSheet((s) => !s)}>
      {T.talk}
      <kbd>T</kbd>
    </button>
  );

  return (
    <div className="hud">
      {sheet && <PhraseSheet lang={snap.lang} onSay={(k) => engine.say(k)} />}

      {snap.seated && snap.targets.length > 0 && (
        <div className="targets">
          <span>{T.to}</span>
          {snap.targets.map((t) => (
            <button key={t.id} type="button" className={"chip" + (t.id === snap.selTarget ? " sel" : "")} onClick={() => engine.setTarget(t.id)}>
              <span>{t.nick || "?"}</span>
              <Cup level={t.glass} full={snap.full} />
            </button>
          ))}
        </div>
      )}

      {snap.hint && <div className="hint">{snap.hint}</div>}

      {!snap.seated ? (
        <div className="bar">
          {snap.canSit && (
            <button className="btn main" type="button" onClick={() => engine.sit()}>
              {T.sit}
              <kbd>E</kbd>
            </button>
          )}
          {talk}
        </div>
      ) : (
        <div className="bar">
          <button className="btn amber" type="button" disabled={!snap.canPour} onClick={() => engine.pour()}>
            {T.pour}
            <kbd>1</kbd>
          </button>
          <button className="btn" type="button" disabled={!snap.canDrink} onClick={() => engine.drink()}>
            {T.drink}
            <kbd>2</kbd>
          </button>
          <button className="btn" type="button" disabled={!snap.dish || snap.dish.left <= 0} onClick={() => engine.eat()}>
            {T.eat}
            {snap.dish && (
              <>
                {" · "}
                {snap.dish.name} {snap.dish.left}
              </>
            )}
            <kbd>3</kbd>
          </button>
          <button className="btn main" type="button" onClick={() => engine.cheer()}>
            {T.cheer}
            <kbd>4</kbd>
          </button>
          {talk}
          <button className="btn" type="button" onClick={() => engine.stand()}>
            {T.stand}
            <kbd>E</kbd>
          </button>
        </div>
      )}

      <div className="stats">{T.stats(snap.stats.drank, snap.stats.poured, snap.stats.got)}</div>
    </div>
  );
}
