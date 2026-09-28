# Cloudflare Pages 배포 안내

이 프로젝트는 `public/`의 정적 랜딩페이지와 `functions/api/`의 Cloudflare Pages Functions로 구성됩니다.
Render 서버는 더 이상 필요하지 않습니다.

## 1. Pages 프로젝트 만들기

1. Cloudflare 대시보드에서 **Workers & Pages → Create application → Pages → Connect to Git**을 선택합니다.
2. GitHub의 `chinhyunseo4-droid/teamB` 저장소와 `main` 브랜치를 선택합니다.
3. 설정은 아래처럼 입력합니다.
   - Framework preset: `None`
   - Build command: 비워 두기
   - Build output directory: `public`
4. **Save and Deploy**를 누릅니다.

## 2. 환경 변수 넣기

첫 배포가 끝나면 프로젝트의 **Settings → Environment variables → Production**에서 아래 값을 추가합니다.
값은 기존 Render Environment에 넣었던 것과 동일합니다.

- `GOOGLE_SHEETS_WEBHOOK_URL`
- `GOOGLE_SHEETS_TOKEN`
- `OPERATOR_EMAIL`
- `RETENTION_PERIOD`

`GOOGLE_SHEETS_TOKEN`은 Secret으로 추가하세요. 환경 변수를 저장한 뒤 **Deployments → Retry deployment**를 한 번 실행합니다.

## 3. 확인

Cloudflare가 만든 `pages.dev` 주소에서 다음을 확인합니다.

- 첫 화면이 즉시 열리는지
- 고연전 서비스 신청 폼이 Google Sheets에 저장되는지
- 사전 예약 이메일도 Google Sheets에 저장되는지

참고: 기존 `admin.html`과 Render 전용 운영 통계 API는 Cloudflare Pages 이전 범위에 포함하지 않았습니다. 신청 폼과 사전 예약 목록은 Google Sheets에서 확인합니다.