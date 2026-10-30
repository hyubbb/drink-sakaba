export type Lang = "ko" | "ja";

export type PhraseCategory = { id: string; ko: string; ja: string; items: [key: string, ko: string, ja: string][] };

/** Fixed phrases only. Everyone sees a phrase in their own language, so translation is free. */
export const PHRASES: PhraseCategory[] = [
  { id: "greet", ko: "인사", ja: "あいさつ", items: [["hi", "안녕", "こんばんは"], ["sit", "앉아도 돼?", "座っていい？"], ["welcome", "어서 와", "いらっしゃい"], ["leave", "먼저 갈게", "先に帰るね"], ["bye", "또 봐", "またね"]] },
  { id: "care", ko: "위로", ja: "ねぎらい", items: [["otsu", "수고했어", "お疲れ"], ["koseng", "고생했어", "大変だったね"], ["hard", "힘들었겠다", "しんどかったでしょ"], ["canbe", "그럴 수 있지", "そういうこともあるよ"], ["doing", "잘하고 있어", "よく頑張ってるよ"]] },
  { id: "ask", ko: "질문", ja: "しつもん", items: [["week", "이번 주 어땠어?", "今週どうだった？"], ["today", "오늘 어땠어?", "今日どうだった？"], ["work", "내일 출근해?", "明日も仕事？"]] },
  { id: "ans", ko: "대답", ja: "こたえ", items: [["good", "좋았어", "よかった"], ["bad", "나빴어", "最悪だった"], ["soso", "그냥저냥", "まあまあ"], ["happy", "행복했어", "幸せだった"], ["tired", "피곤해", "疲れた"]] },
  { id: "why", ko: "원인", ja: "げんいん", items: [["co", "회사가 문제", "会社が悪い"], ["boss", "상사가 문제", "上司が悪い"], ["money", "돈이 문제", "お金がない"], ["love", "연애가 문제", "恋愛がうまくいかない"], ["self", "내가 문제", "自分が悪い"]] },
  { id: "drink", ko: "술자리", ja: "のみ", items: [["one", "한잔해~", "一杯どう？"], ["nomu", "마셔라 마셔라", "飲め飲め～"], ["pourme", "술 따라줘", "注いで～"], ["kanpai", "짠!", "乾杯！"], ["oneshot", "원샷?", "一気いく？"], ["slow", "천천히 마셔", "ゆっくり飲んで"]] },
  { id: "react", ko: "리액션", ja: "リアクション", items: [["thx", "고마워", "ありがとう"], ["lol", "ㅋㅋㅋ", "ｗｗｗ"], ["heol", "헐", "えっ"], ["really", "진짜?", "マジで？"], ["agree", "맞아맞아", "わかるわかる"], ["dots", "……", "……"]] },
  { id: "food", ko: "안주", ja: "つまみ", items: [["yum", "이거 맛있다", "これうまい"], ["have", "하나 먹어", "ひとつどうぞ"]] },
];

export const PHRASE_MAP: Record<string, { ko: string; ja: string }> = {};
PHRASES.forEach((c) => c.items.forEach(([k, ko, ja]) => (PHRASE_MAP[k] = { ko, ja })));

export const UI = {
  ko: {
    sit: "앉기", stand: "일어나기", pour: "따르기", drink: "마시기", eat: "안주", cheer: "짠", talk: "말하기",
    to: "따라 줄 사람", hintWalk: "걸어서 빈자리로 가 보세요", hintNear: "앉을 수 있는 자리예요",
    hintSeatNobody: "맞은편이 비어 있어요. 누가 앉으면 따라 줄 수 있어요",
    hintEmpty: "잔이 비었어요. 앞사람이 따라 줘야 마실 수 있어요",
    taken: "다른 분이 먼저 앉았어요", poured: (n: string) => `${n} 님이 한 잔 따라 줬어요`, master: "대장이 한 잔 따라 줬어요",
    refill: (d: string) => `${d} 나왔어요`, live: (n: number, s: number) => `${s}호점 · 손님 ${n}명`,
    solo: "혼자 모드 · 연습 손님과 함께", connecting: "연결 중", offline: "연결이 끊겼어요 · 다시 연결 중",
    stats: (a: number, b: number, c: number) => `마신 잔 ${a} · 따라준 잔 ${b} · 받은 잔 ${c}`,
    kanpai: "짠!", botName: "쿠마(연습)", soloToast: "지금은 혼자예요. 연습 손님 쿠마가 앉아 있어요",
    gateTitle: "모르는 사람과 마주 앉아 한 잔씩 따라 주는 온라인 혼술집.", nick: "닉네임", nickPh: "예: 퇴근한 곰",
    enter: "노렌을 걷고 들어가기", keys: "이동 WASD·방향키 · 앉기/일어나기 E · 따르기 1 · 마시기 2 · 안주 3 · 짠 4 · 말하기 T · 드래그로 시점 회전",
    guest: "손님",
  },
  ja: {
    sit: "座る", stand: "立つ", pour: "注ぐ", drink: "飲む", eat: "つまむ", cheer: "乾杯", talk: "話す",
    to: "注ぐ相手", hintWalk: "歩いて空いている席へ", hintNear: "座れる席です",
    hintSeatNobody: "向かいは空席です。誰か座ったら注げます",
    hintEmpty: "グラスが空です。向かいの人に注いでもらおう",
    taken: "先に座った人がいます", poured: (n: string) => `${n}さんが一杯注いでくれた`, master: "大将が一杯注いでくれた",
    refill: (d: string) => `${d}が来た`, live: (n: number, s: number) => `${s}号店・客 ${n}人`,
    solo: "ひとりモード・練習客といっしょ", connecting: "接続中", offline: "接続が切れました・再接続中",
    stats: (a: number, b: number, c: number) => `飲んだ ${a}・注いだ ${b}・注がれた ${c}`,
    kanpai: "乾杯！", botName: "クマ(練習)", soloToast: "今はひとりです。練習客のクマが座っています",
    gateTitle: "知らない誰かと向かい合って、一杯ずつ注ぎあう店。", nick: "ニックネーム", nickPh: "例：帰宅したクマ",
    enter: "のれんをくぐる", keys: "移動 WASD・矢印 · 座る/立つ E · 注ぐ 1 · 飲む 2 · つまむ 3 · 乾杯 4 · 話す T · ドラッグで視点回転",
    guest: "名無し",
  },
};
export type UIText = (typeof UI)["ko"];
