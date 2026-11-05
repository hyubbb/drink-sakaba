# 메타모아 등록과 API 연결

드링크사카바를 [메타모아](https://metamoa.com)에 등록하고 접속자 수·업데이트·이벤트·야영지 캐릭터를 연결하는 순서입니다.
API 규칙은 <https://metamoa.com/api>에 있습니다.

키 세 종류는 모두 **서버 환경 변수에만** 둡니다. 코드, 채팅, 커밋에 적지 않고 `NEXT_PUBLIC_`도 붙이지 않습니다.

| 값 | 어디서 생기나 | 어디에 두나 |
| --- | --- | --- |
| `METAMOA_REQUEST_KEY` (`mm_req_…`) | 1단계 신청 응답 | `.env.local` (스크립트가 자동 저장) |
| `METAMOA_WEBHOOK_SECRET` (`whsec_…`) | 1단계 신청 응답 | `.env.local` + Vercel |
| `METAMOA_KEY` (`mm_live_…`) | 3단계 소유자 확인 후 | `.env.local` + Vercel |
| `CRON_SECRET` | 직접 만든 임의 문자열 | Vercel + GitHub 저장소 secret |

## 서버에 들어 있는 것

| 주소 | 하는 일 |
| --- | --- |
| `GET /api/live` | 지금 접속자 수를 숫자 하나로 돌려줍니다(이자카야·포차 전 채널 합계, 연습 손님 제외, 1분 캐시). 신청할 때 `live_api`로 등록됩니다. |
| `POST /api/metamoa/webhook` | 심사 결과(`submission.approved` / `submission.rejected`)를 받습니다. `X-Metamoa-Signature`를 `METAMOA_WEBHOOK_SECRET`로 확인하고 Vercel 로그에 남깁니다. |
| `GET /api/metamoa/live` | 접속자 수를 메타모아에 보냅니다(`POST /api/live/{space_id}`). `Authorization: Bearer $CRON_SECRET`가 있어야 동작하고, 10분마다 GitHub Actions가 호출합니다. |
| `<meta name="metamoa-site-verification">` | `METAMOA_SITE_VERIFICATION`이 있으면 모든 페이지 `<head>`에 들어갑니다. |

업데이트·이벤트·캐릭터는 하루에 한두 번 쓰는 기능이라 `scripts/metamoa.mjs`로 직접 보냅니다.

## 1. 등록 신청

배포가 끝나 <https://drink-sakaba.vercel.app/>와 `/api/live`가 열리는지 먼저 확인합니다. 메타모아는 신청할 때 주소를 열어 보고, 안 열리면 거절합니다.

저장소 폴더에서:

```bash
# 결과를 메일로도 받으려면 .env.local에 METAMOA_EMAIL=주소 를 넣어 둡니다
node scripts/metamoa.mjs submit --agree
```

`--agree`는 [이용약관](https://metamoa.com/terms)과 [개인정보처리방침](https://metamoa.com/privacy)에 동의한다는 뜻입니다.
보내는 내용: 이름 「드링크사카바」, 소개 「모르는 사람과 마주 앉아 한 잔씩 따라주는 온라인 혼술집」, 지역 `kr`, 언어 `ko, ja`, `api_hookup: true`, 웹훅·`live_api` 주소. 분류(`cat1`)는 비워서 메타모아가 고르게 합니다.

성공하면 신청 번호와 두 키가 `.env.local`에 저장되고, 화면에는 키가 나오지 않습니다. 같은 사이트는 다시 신청할 수 없으니(409) 한 번만 실행합니다.

그다음 **Vercel → Settings → Environment Variables**에 `METAMOA_WEBHOOK_SECRET`을 넣고 다시 배포합니다. 그래야 심사 결과가 웹훅으로 들어옵니다.

## 2. 결과 확인

```bash
node scripts/metamoa.mjs status
```

웹훅으로 받은 결과는 Vercel → Logs에서 `[metamoa]`로 검색하면 보입니다.

## 3. 승인 뒤: 소유자 확인과 공간 키

1. `status`가 알려 주는 `https://metamoa.com/owner?id={id}`를 엽니다.
2. 확인 방법은 **메타 태그**를 고릅니다. 받은 코드를 Vercel 환경 변수 `METAMOA_SITE_VERIFICATION`에 넣고 다시 배포합니다(태그는 빌드할 때 들어갑니다).
3. 메타모아에서 확인을 누르고 공간 키(`mm_live_…`)를 발급받습니다. 새로 발급하면 이전 키는 바로 멈춥니다.
4. 공간 키와 공간 ID를 `.env.local`과 Vercel에 넣습니다.

```
METAMOA_SPACE_ID=...
METAMOA_KEY=mm_live_...
```

5. `CRON_SECRET`을 하나 만들어(예: `openssl rand -hex 24`) Vercel 환경 변수와 GitHub 저장소 **Settings → Secrets and variables → Actions**의 secret에 같은 값으로 넣고 다시 배포합니다. 그러면 `.github/workflows/metamoa-live.yml`이 10분마다 접속자 수를 보냅니다. Vercel이 아닌 다른 주소면 저장소 variable `SITE_URL`을 넣습니다.

## 4. 업데이트·이벤트

```bash
# 소식 한 줄: 24시간에 한 번, 200자·3줄까지, 링크는 우리 사이트만
node scripts/metamoa.mjs update "금요일 밤엔 포차 3채널이 북적여요"

# 이벤트: 제목 30자, 설명 40자(링크 X), 최대 31일, 진행 전 이벤트는 5개까지
node scripts/metamoa.mjs event add --title "금요일 혼술 모임" \
  --start 2026-11-07T20:00:00+09:00 --end 2026-11-07T23:59:00+09:00 \
  --desc "포차 1채널에서 같이 한 잔"
node scripts/metamoa.mjs event list
node scripts/metamoa.mjs event rm <event_id>
```

접속자 수를 손으로 한 번 보내려면 `node scripts/metamoa.mjs live` (사이트의 `/api/live` 값을 읽어 보냅니다).

## 5. 야영지 캐릭터

```bash
node scripts/metamoa.mjs character path/to/character.glb   # 또는 .png
node scripts/metamoa.mjs character                          # 심사 상태: none / checking / live / rejected
```

- GLB: 4MB 이하, 삼각형 2만 개, 텍스처 4장(2048px), 관절 64개 이하, 외부 URI·`KHR_texture_basisu` 불가. 애니메이션은 하나만 남고 `idle`이 있으면 그걸 씁니다. 1.8m 크기로 세워집니다.
- PNG: 1MB, 한 변 1024px 이하, 높이 128px 이상.
- 하루 5번까지. 다른 회사 로고·캐릭터가 들어가면 거절됩니다.

## 호출 한도

- 접속자 수: 10분에 한 번(9분 안에 다시 보내면 거절)
- 업데이트: 24시간에 한 번
- 이벤트·접속자 수 합쳐서 공간당 시간당 60번
- 신청: IP당 하루 3번
