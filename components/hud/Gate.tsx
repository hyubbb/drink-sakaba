"use client";

import { useState } from "react";
import { UI, type Lang } from "@/lib/game/i18n";

export function Gate({ initialNick, initialLang, onEnter }: { initialNick: string; initialLang: Lang; onEnter: (nick: string, lang: Lang) => void }) {
  const [nick, setNick] = useState(initialNick);
  const [lang, setLang] = useState<Lang>(initialLang);
  const T = UI[lang];
  return (
    <div className="gate">
      <form
        className="noren"
        onSubmit={(e) => {
          e.preventDefault();
          onEnter(nick, lang);
        }}
      >
        <h1>
          souka <span>酒場</span>
        </h1>
        <p>
          {UI.ko.gateTitle}
          <br />
          {UI.ja.gateTitle}
        </p>
        <label htmlFor="nick">
          {UI.ko.nick} / {UI.ja.nick}
          <input id="nick" type="text" maxLength={12} autoComplete="off" placeholder={T.nickPh} value={nick} onChange={(e) => setNick(e.target.value)} />
        </label>
        <div className="seg">
          {(["ko", "ja"] as const).map((l) => (
            <button key={l} type="button" className={l === lang ? "sel" : ""} onClick={() => setLang(l)}>
              {l === "ko" ? "한국어" : "日本語"}
            </button>
          ))}
        </div>
        <button className="btn main" type="submit">
          {T.enter}
        </button>
        <div className="keys">{T.keys}</div>
      </form>
    </div>
  );
}
