"use client";

import { useEffect, useRef, useState } from "react";
import { CHANNEL_CAPACITY, CHANNEL_COUNT } from "@/lib/game/constants";
import { UI, type Lang } from "@/lib/game/i18n";

type Props = {
  lang: Lang;
  /** channel I am in; 0 while not connected */
  current: number;
  /** people per channel, null when unknown (solo mode or lobby not answered yet) */
  counts: Record<number, number> | null;
  disabled?: boolean;
  onPick: (channel: number) => void;
};

/** Channel dropdown in the shop sign: each row shows how full that channel is. */
export function ChannelPicker({ lang, current, counts, disabled, onPick }: Props) {
  const T = UI[lang];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const channels = Array.from({ length: CHANNEL_COUNT }, (_, i) => i + 1);

  // close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.code === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    // focus the current channel when the list opens
    requestAnimationFrame(() => items.current[Math.max(0, (current || 1) - 1)]?.focus());
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, current]);

  const move = (from: number, d: number) => {
    const next = (from + d + CHANNEL_COUNT) % CHANNEL_COUNT;
    items.current[next]?.focus();
  };

  return (
    <div className="chPick" ref={root}>
      <button
        type="button"
        className="chTrigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {current ? T.channel(current) : T.channelAuto}
        <span className="chCaret" aria-hidden="true" />
      </button>
      {open && (
        <div className="chMenu" role="listbox" aria-label={T.channelPick}>
          <div className="chMenuTitle">{T.channelPick}</div>
          {channels.map((ch, i) => {
            const n = counts ? counts[ch] ?? 0 : null;
            const here = ch === current;
            const full = n !== null && n >= CHANNEL_CAPACITY && !here;
            const ratio = n === null ? 0 : Math.min(1, n / CHANNEL_CAPACITY);
            const level = n === null ? "" : ratio >= 1 ? " full" : ratio >= 0.75 ? " busy" : "";
            return (
              <button
                key={ch}
                ref={(el) => { items.current[i] = el; }}
                type="button"
                role="option"
                aria-selected={here}
                disabled={full}
                className={"chItem" + (here ? " here" : "")}
                onClick={() => { setOpen(false); if (!here) onPick(ch); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
                  if (e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
                }}
              >
                <span className="chName">
                  {here && <i className="chDot" aria-hidden="true" />}
                  {T.channel(ch)}
                </span>
                <span className={"chMeter" + level} aria-hidden="true">
                  <i style={{ width: `${ratio * 100}%` }} />
                </span>
                <span className="chCount">
                  {n === null ? "–" : full ? T.channelFull : T.people(n, CHANNEL_CAPACITY)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
