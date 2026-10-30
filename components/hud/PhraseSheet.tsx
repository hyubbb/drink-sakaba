"use client";

import { useState } from "react";
import { PHRASES, PHRASE_MAP, type Lang } from "@/lib/game/i18n";

export function PhraseSheet({ lang, venue, onSay }: { lang: Lang; venue: "izakaya" | "pocha"; onSay: (key: string) => void }) {
  const [tab, setTab] = useState("care");
  const cat = PHRASES.find((c) => c.id === tab) ?? PHRASES[0];
  return (
    <div className="sheet">
      <div className="tabs" role="tablist">
        {PHRASES.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === tab} className={"tab" + (c.id === tab ? " sel" : "")} onClick={() => setTab(c.id)}>
            {c[lang]}
          </button>
        ))}
      </div>
      <div className="phrases">
        {cat.items.filter((it) => !it[3] || it[3] === venue).map(([k]) => (
          <button key={k} type="button" className="phrase" onClick={() => onSay(k)}>
            {PHRASE_MAP[k][lang]}
          </button>
        ))}
      </div>
    </div>
  );
}
