# ZA2030 개인 액션 라운드

"개인 액션 라운드" 세션에서 참가자들이 이번 주 실천 다짐 문장을 완성해 제출하고,
전체 다짐을 함께 보는 공유 보드입니다. ZA2030 4대 축(Customer at the Core / Speed /
Truly Global / High-Performance Team ZEISS) 중 하나를 골라 다짐을 태깅합니다.

정기적으로 리뷰하는 것을 전제로 설계되어, 제출할 때마다 **새 이력(history)으로 쌓이고**
(기존 다짐을 덮어쓰지 않음) 등록일/수정일/완료 여부를 함께 기록합니다.

## 화면 구성
- **다짐 작성**: 이름·소속 입력 → 4대 축 중 하나 선택(예시 문장 표시) → "이번 주에 나는
  ___을 하겠습니다. 그 이유는 ___을 더 잘 실천하기 위해서입니다." 문장 실시간 미리보기 →
  팀/동료에게 받고 싶은 지원(선택 입력) → 제출. 제출할 때마다 새 다짐 이력으로 기록되며,
  이름·소속만 다음 제출을 위해 편의상 기억해둡니다.
- **함께 보기**:
  - **전체 피드 / 참가자별 보기** 전환: 전체 피드는 모든 다짐을 최신 등록순으로,
    참가자별 보기는 사람별로 묶어 지난 다짐 이력과 완료 건수를 함께 보여줍니다(정기 리뷰용).
  - 상단 필터 칩(전체/4대 축)으로 축별 좁혀보기, "🙋 지원 요청만" 토글로 지원이 필요한
    다짐만 모아보기
  - 카드에 등록일·수정일·완료일 표시, 공감(❤️) 버튼, 지원 요청 내용(있는 경우 강조 박스)
  - 본인 카드에서만: ✏️ 수정, ✅ 완료로 표시/↩️ 진행중으로 되돌리기, 삭제
  - 2초 간격 자동 새로고침(이 탭이 보이는 동안만), CSV 다운로드, 관리자 전체 삭제

## 제출/수정 규칙
- 제출은 **매번 새 이력 항목**으로 쌓입니다(과거 주차 다짐이 사라지지 않음)
- 본인이 등록한 항목은 기기 토큰으로 소유를 확인해 직접 **수정**(오탈자 정정 등, 등록일은
  유지되고 수정일만 갱신), **완료 여부 토글**, **삭제**가 가능합니다
- 다른 사람의 항목은 공감만 가능하고 수정·완료 처리·삭제는 할 수 없습니다

## 배포 방법 (GitHub → Netlify 연결)
Netlify Blobs를 사용하므로 **드래그앤드롭 배포는 불가능**하고, GitHub 저장소를 만들어
Netlify와 연결하는 방식만 지원됩니다.

1. 이 폴더 전체를 새 GitHub 저장소에 푸시합니다.
2. Netlify 대시보드 → "Add new site" → "Import an existing project" → 방금 만든 저장소 선택
3. 빌드 설정은 `netlify.toml`에 이미 포함되어 있어 그대로 두면 됩니다 (Build command: `npm install`)
4. 배포 완료 후, Netlify 사이트 설정 → **Environment variables**에서 `ADMIN_TOKEN` 값을
   원하는 관리자 비밀번호로 설정합니다. (설정하지 않으면 기본값 `za2030admin`이 사용됩니다.)
5. 배포된 주소로 접속해 제출/수정/완료토글/함께보기/공감/CSV/관리자 삭제가 정상 동작하는지 확인합니다.

## 데이터 저장
- Netlify Blobs 스토어 이름: `za2030-action-round` (기존 스포트라이트 세션 사이트와는
  완전히 분리된 새 스토어이므로 데이터가 섞이지 않습니다)
- 항목 필드: `id, deviceToken, name, team, pillarKey, pillarName, actionText, supportRequest,
  createdAt, updatedAt, done, doneAt, likes, likedBy`
- API: `GET /api/action-round` (조회), `POST /api/action-round`
  (`action: submit | update | toggle-done | delete | like | unlike | clear-all`)

## 저작권
"© 2026 Joanna Lee. All rights reserved." 문구가 페이지 하단에 포함되어 있습니다.
