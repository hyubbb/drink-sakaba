"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VENUES, type Venue } from "@/lib/game/constants";
import { Engine, type Snapshot } from "@/lib/game/engine";
import type { Lang } from "@/lib/game/i18n";
import type { NetRoom } from "@/lib/net/protocol";
import { getSupabase, usePrivateChannels } from "@/lib/net/supabaseClient";
import { joinShop } from "@/lib/net/supabaseRoom";
import { Gate } from "./hud/Gate";
import { Hud } from "./hud/Hud";
import { Joystick } from "./hud/Joystick";
import { TopBar } from "./hud/TopBar";
import { Toast } from "./hud/Toast";
import { VenuePicker } from "./hud/VenuePicker";

const EMPTY = () => () => {};
const LOCAL = process.env.NEXT_PUBLIC_SAKABA_NET === "local";

/** Where the player is: venue + channel (null = pick the first channel with room). */
type Place = { venue: Venue; channel: number | null; gen: number };

function savedVenue(): Venue {
  try {
    const v = localStorage.getItem("sakaba.venue");
    return VENUES.includes(v as Venue) ? (v as Venue) : "izakaya";
  } catch {
    return "izakaya";
  }
}

function connector(engine: Engine, place: Place) {
  return async (): Promise<NetRoom | null> => {
    if (LOCAL) {
      const { LocalRoom } = await import("@/lib/net/localRoom");
      return new LocalRoom(engine.myId, place.venue, place.channel ?? 1);
    }
    const sb = getSupabase();
    if (!sb) return null;
    return joinShop(sb, engine.myId, usePrivateChannels(), place.venue, place.channel);
  };
}

export default function Game() {
  const stageRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place>(() => ({ venue: savedVenue(), channel: null, gen: 0 }));
  const [engine, setEngine] = useState<Engine | null>(null);
  /** nickname and language once the player has walked in; reused when moving between venues */
  const session = useRef<{ nick: string; lang: Lang } | null>(null);

  // A new venue or channel means a new scene and a new connection: rebuild the engine.
  useEffect(() => {
    if (!stageRef.current || !labelsRef.current) return;
    const e = new Engine(stageRef.current, labelsRef.current, { venue: place.venue });
    if (session.current) e.enter(session.current.nick, session.current.lang, connector(e, place));
    setEngine(e);
    // local multiplayer testing only: expose the engine for scripted checks
    if (LOCAL) (window as unknown as { __sakaba?: Engine }).__sakaba = e;
    return () => {
      e.dispose();
      setEngine(null);
    };
  }, [place]);

  const snap = useSyncExternalStore<Snapshot | null>(
    engine ? engine.subscribe : EMPTY,
    () => (engine ? engine.getSnapshot() : null),
    () => null,
  );

  const enter = (nick: string, lang: Lang) => {
    if (!engine) return;
    engine.enter(nick, lang, connector(engine, place));
    const s = engine.getSnapshot();
    session.current = { nick: engine.savedNick || nick, lang: s.lang };
  };

  const go = useCallback((venue: Venue, channel: number | null) => {
    if (engine && session.current) session.current.lang = engine.getSnapshot().lang;
    try { localStorage.setItem("sakaba.venue", venue); } catch { /* ignore */ }
    setPlace((p) => ({ venue, channel, gen: p.gen + 1 }));
  }, [engine]);

  return (
    <>
      <div id="stage" ref={stageRef} />
      <div id="labels" ref={labelsRef} />
      {engine && snap && !snap.entered && <Gate initialNick={engine.savedNick} initialLang={snap.lang} onEnter={enter} />}
      {engine && snap?.entered && (
        <>
          <TopBar snap={snap} engine={engine} onGo={go} />
          <Hud snap={snap} engine={engine} />
          {!snap.seated && !snap.atDoor && <Joystick engine={engine} />}
          {snap.atDoor && <VenuePicker snap={snap} onPick={(v) => (v === snap.venue ? engine.dismissDoor() : go(v, null))} onStay={() => engine.dismissDoor()} />}
          <Toast toast={snap.toast} />
        </>
      )}
    </>
  );
}
