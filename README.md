# souka 酒場 (drink-sakaba)

모르는 사람과 6인 테이블에 마주 앉아 맥주를 따라 주고, 정해진 문장으로만 이야기하는 레트로 3D 온라인 혼술집.
知らない誰かと向かい合って、一杯ずつ注ぎあう店。

## 실행

요구 사항: Node.js 20 이상

```bash
npm install
cp .env.example .env.local   # Supabase 값 채우기 (없으면 혼자 모드)
npm run dev                  # http://localhost:3000
```

Supabase 없이 여러 명 테스트: `.env.local`에 `NEXT_PUBLIC_SAKABA_NET=local`을 넣고 같은 브라우저에서 탭 두 개를 열면
BroadcastChannel로 서로 보입니다.

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (타입 체크 포함) |
| `npm run start` | 빌드 결과 실행 |
| `npm run typecheck` | 타입 체크만 |

백엔드 설정은 [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)를 보세요.

## 규칙

- 가게는 **이자카야**와 **포차** 두 곳, 각각 **1~5채널**. 좌측 상단 간판에서 가게를 바꾸거나 채널을 고르고, 입구 밖으로 걸어 나가면 어디로 갈지 고르는 창이 뜹니다. 채널을 안 고르면 자리가 남은 첫 채널로 들어갑니다(채널당 16명).
- 테이블 2개 × 6자리 (3 대 3 마주 보기). 직접 걸어가서 앉고, 일어나서 다른 자리로 옮깁니다.
- 자기 잔에는 못 따르고, 맞은편 줄 사람에게만 따를 수 있습니다. 따르면 가득, 가득 찬 잔에는 못 따릅니다.
- 잔 하나는 세 모금(`FULL = 3`).
- 마주 앉은 두 사람이 접시 하나를 공유합니다. 가게마다 5가지 안주(이자카야: 꼬치·풋콩·가라아게·오뎅·히야얏코, 포차: 떡볶이·어묵꼬치·계란말이·닭꼬치·골뱅이무침)가 랜덤으로 나오고, 한 번에 하나씩 집어 먹습니다. 비면 2.5초 뒤 다른 안주가 나옵니다.
- 짠: 같은 테이블에서 2.5초 안에 두 명 이상 누르면 성공.
- 문장은 버튼으로만. 보는 사람 언어(한국어/일본어)로 보입니다.
- 맞은편이 비어 있고 잔이 10초 이상 비어 있으면 대장(이자카야)이나 이모(포차)가 한 잔 따라 줍니다.
- 가게에 혼자 있으면 연습 손님 쿠마가 앉아 있다가, 다른 사람이 오면 사라집니다.

## 구조

```
app/                    Next.js App Router (layout, page, 전역 CSS)
components/
  GameClient.tsx        게임을 브라우저에서만 불러오기 (ssr: false)
  Game.tsx              엔진 생성, 스냅샷 구독, 실시간 연결
  hud/                  입장, 간판(가게·채널 선택), 하단 버튼, 문장 시트, 입구 가게 선택, 조이스틱, 토스트 (React)
lib/game/
  engine.ts             게임 상태·규칙·프레임 루프·네트워크 처리 (Three.js, React 밖)
  world.ts              가게(이자카야/포차), 테이블, 자리, 잔, 공유 접시
  character.ts          souka 캐릭터와 애니메이션
  constants.ts          규칙 수치, 안주 목록
  i18n.ts               문장과 UI 문구 (ko/ja)
  sound.ts              합성 효과음
lib/net/
  protocol.ts           Presence/Broadcast 메시지 형식과 NetRoom 인터페이스
  supabaseRoom.ts       Supabase Realtime 구현 + 채널 자동 배정, 테이블 채널
  localRoom.ts          로컬 테스트용 BroadcastChannel 구현
  supabaseClient.ts     환경 변수로 클라이언트 생성
```

게임 엔진은 React 밖에서 돌고, React는 `useSyncExternalStore`로 엔진의 스냅샷(200ms마다, 바뀔 때만)을 받아 HUD를 그립니다.
이름표와 말풍선은 매 프레임 위치가 바뀌어서 엔진이 직접 DOM을 움직입니다.

### 네트워크

메시지는 받는 사람 수만큼 세어질 가능성이 커서, 받는 사람을 줄이는 쪽으로 채널을 두 단계로 나눴습니다.

- 가게 채널 `sakaba:<izakaya|pocha>:ch-<1~5>`
  - Presence: 닉네임, 언어, 색, 자리 (거의 안 바뀌는 값만. 무료 플랜 Presence 한도가 초당 20건)
  - Broadcast `mv`: 서 있는 사람 위치. 걷는 중 초당 5번, 멈출 때 한 번
  - Broadcast `ev` say: 서서 한 말
- 테이블 채널 `sakaba:<venue>:ch-<n>:t1|t2` (그 테이블에 앉은 최대 6명)
  - Broadcast `st`: 잔·접시 상태 (바뀔 때, 누가 앉을 때, 20초마다)
  - Broadcast `ev`: 마시기·따르기·안주·짠·문장

누가 들어오거나 앉을 때의 답장은 1.5~2.5초에 걸쳐 흩어 보내서 한꺼번에 몰리지 않게 합니다.
가게나 채널을 바꾸면 엔진과 연결을 새로 만듭니다(닉네임·언어는 유지).

공유 접시는 a쪽 자리 사람이 "관리자"로 상태를 정하고, b쪽 사람이 먹으면 `ev eat`을 받아 관리자가 개수를 줄입니다.
관리자가 일어나면 남은 사람이 마지막 상태를 이어받습니다.
