"use client";

import { useEffect, useState } from "react";
import { CHAT_MAX } from "@/lib/game/chat";
import { UI, type Lang } from "@/lib/game/i18n";

type Props = {
  lang: Lang;
  seated: boolean;
  /** performance.now() when the next line may be sent */
  readyAt: number;
  onSend: (text: string) => boolean;
};

/** One-line free chat for the people at my table: 30 characters, one line every 7 seconds. */
export function ChatBox({ lang, seated, readyAt, onSend }: Props) {
  const T = UI[lang];
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => performance.now());
  const wait = Math.max(0, Math.ceil((readyAt - now) / 1000));

  // tick once a second while cooling down so the countdown moves
  useEffect(() => {
    if (readyAt <= performance.now()) return;
    setNow(performance.now());
    const id = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= readyAt) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [readyAt]);

  const len = [...text].length;
  const canSend = seated && wait === 0 && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    if (onSend(text)) setText("");
  };

  return (
    <form
      className="chat"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input
        id="chatInput"
        type="text"
        value={text}
        disabled={!seated}
        autoComplete="off"
        enterKeyHint="send"
        placeholder={seated ? T.chatPh : T.chatStanding}
        aria-label={T.chatPh}
        onChange={(e) => setText([...e.target.value].slice(0, CHAT_MAX).join(""))}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <span className="chatCount" aria-hidden="true">
        {len}/{CHAT_MAX}
      </span>
      <button type="submit" className="chatSend" disabled={!canSend}>
        {wait > 0 ? T.chatWait(wait) : T.chatSend}
      </button>
    </form>
  );
}
