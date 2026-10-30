"use client";

import dynamic from "next/dynamic";

/** WebGL and the realtime socket only exist in the browser, so the game never renders on the server. */
const Game = dynamic(() => import("./Game"), { ssr: false, loading: () => <div className="loading">souka 酒場</div> });

export default function GameClient() {
  return <Game />;
}
