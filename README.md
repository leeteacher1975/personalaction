# ZA2030 개인 액션 라운드

"개인 액션 라운드" 세션에서 참가자들이 이번 주 실천 다짐 문장을 완성해 제출하고,
전체 다짐을 함께 보는 공유 보드입니다. ZA2030 4대 축(Customer at the Core / Speed /
Truly Global / High-Performance Team ZEISS) 중 하나를 골라 다짐을 태깅합니다.

## 화면 구성
- **다짐 작성**: 이름·소속 입력 → 4대 축 중 하나 선택(예시 문장 표시) → "이번 주에 나는
  ___을 하겠습니다. 그 이유는 ___을 더 잘 실천하기 위해서입니다." 문장 실시간 미리보기 → 제출
- **함께 보기**: 전체 다짐을 최신순으로 한 피드에 표시, 상단 필터 칩(전체/축별)으로 좁혀보기,
  카드별 공감(❤️) 버튼, 2초 간격 자동 새로고침(이 탭이 보이는 동안만), CSV 다운로드, 관리자 전체 삭제

## 제출 규칙
- 기기(브라우저)당 다짐 **1개**. 같은 기기로 다시 제출하면 기존 다짐을 덮어씀(수정 개념)
- 본인 항목은 직접 삭제 가능 (카드의 "삭제" 버튼, 기기 토큰으로 소유 확인)

## 배포 방법 (GitHub → Netlify 연결)
Netlify Blobs를 사용하므로 **드래그앤드롭 배포는 불가능**하고, GitHub 저장소를 만들어
Netlify와 연결하는 방식만 지원됩니다.

1. 이 폴더 전체를 새 GitHub 저장소에 푸시합니다.
2. Netlify 대시보드 → "Add new site" → "Import an existing project" → 방금 만든 저장소 선택
3. 빌드 설정은 `netlify.toml`에 이미 포함되어 있어 그대로 두면 됩니다 (Build command: `npm install`)
4. 배포 완료 후, Netlify 사이트 설정 → **Environment variables**에서 `ADMIN_TOKEN` 값을
   원하는 관리자 비밀번호로 설정합니다. (설정하지 않으면 기본값 `za2030admin`이 사용됩니다.)
5. 배포된 주소로 접속해 제출/함께보기/공감/CSV/관리자 삭제가 정상 동작하는지 확인합니다.

## 데이터 저장
- Netlify Blobs 스토어 이름: `za2030-action-round` (기존 스포트라이트 세션 사이트와는
  완전히 분리된 새 스토어이므로 데이터가 섞이지 않습니다)
- API: `GET /api/action-round` (조회), `POST /api/action-round`
  (`action: submit | delete | like | unlike | clear-all`)

## 저작권
"© 2026 Joanna Lee. All rights reserved." 문구가 페이지 하단에 포함되어 있습니다.
