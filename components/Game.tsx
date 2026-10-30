"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Engine, type Snapshot } from "@/lib/game/engine";
import type { Lang } from "@/lib/game/i18n";
import { getSupabase, usePrivateChannels } from "@/lib/net/supabaseClient";
import { joinShop } from "@/lib/net/supabaseRoom";
import { Gate } from "./hud/Gate";
import { Hud } from "./hud/Hud";
import { Joystick } from "./hud/Joystick";
import { TopBar } from "./hud/TopBar";
import { Toast } from "./hud/Toast";

const EMPTY = () => () => {};

export default function Game() {
  const stageRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    if (!stageRef.current || !labelsRef.current) return;
    const e = new Engine(stageRef.current, labelsRef.current);
    setEngine(e);
    return () => {
      e.dispose();
      setEngine(null);
    };
  }, []);

  const snap = useSyncExternalStore<Snapshot | null>(
    engine ? engine.subscribe : EMPTY,
    () => (engine ? engine.getSnapshot() : null),
    () => null,
  );

  const enter = (nick: string, lang: Lang) => {
    if (!engine) return;
    engine.enter(nick, lang, async () => {
      if (process.env.NEXT_PUBLIC_SAKABA_NET === "local") {
        const { LocalRoom } = await import("@/lib/net/localRoom");
        return new LocalRoom(engine.myId);
      }
      const sb = getSupabase();
      if (!sb) return null;
      return joinShop(sb, engine.myId, usePrivateChannels());
    });
  };

  return (
    <>
      <div id="stage" ref={stageRef} />
      <div id="labels" ref={labelsRef} />
      {engine && snap && !snap.entered && <Gate initialNick={engine.savedNick} initialLang={snap.lang} onEnter={enter} />}
      {engine && snap?.entered && (
        <>
          <TopBar snap={snap} engine={engine} />
          <Hud snap={snap} engine={engine} />
          {!snap.seated && <Joystick engine={engine} />}
          <Toast toast={snap.toast} />
        </>
      )}
    </>
  );
}
