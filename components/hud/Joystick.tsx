"use client";

import { useEffect, useRef, useState } from "react";
import type { Engine } from "@/lib/game/engine";

/** On-screen stick for touch devices; hidden on mouse/keyboard devices. */
export function Joystick({ engine }: { engine: Engine }) {
  const [coarse, setCoarse] = useState(false);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer:coarse)").matches);
    return () => engine.setJoy(0, 0);
  }, [engine]);

  if (!coarse) return null;

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), m = 40;
    if (d > m) { dx = (dx / d) * m; dy = (dy / d) * m; }
    if (knob.current) knob.current.style.transform = `translate(${dx}px,${dy}px)`;
    engine.setJoy(dx / m, dy / m);
  };
  const end = () => {
    active.current = null;
    if (knob.current) knob.current.style.transform = "";
    engine.setJoy(0, 0);
  };

  return (
    <div
      className="joy"
      onPointerDown={(e) => { active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (e.pointerId === active.current) move(e); }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="knob" ref={knob} />
    </div>
  );
}
