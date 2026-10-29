# 수안부부한의원 시안 데이터 가이드

이 정적 웹사이트는 화면 구성을 검토하기 위한 시안입니다. 후기 5건과 예약 현황 6건은 모두 **가상의 예시**이며 실제 환자, 실제 후기나 실시간 예약 정보가 아닙니다. 공간 원화도 한의학의 분위기를 표현한 이미지입니다. 예약·로그인 등 외부 서비스와 연결되어 있지 않습니다.

## 수정하는 파일

| 파일 | 역할 |
| --- | --- |
| `data/content.json` | 화면에 사용하는 문구·의료진·리뷰·예약·이미지 입력 |
| `schema/content.schema.json` | 필수 필드·형식·상태값의 검증 계약 |
| `assets/` | 낮·밤 원화, 진료/공간 원화와 의료진 이미지 |
| `assets/provenance.json` | 자산별 출처, 원본 커밋, 크기, SHA-256 및 변환 기록 |
| `dist/` | 빌드 결과물. 직접 수정하지 않고 다시 생성 |

JSON 파일은 UTF-8로 저장하며 주석·마지막 쉼표를 쓰지 않습니다. 이미지 경로는 `assets/art/hero-day.webp`처럼 저장소 루트 기준으로 표기합니다. `/suan-clinic-demo/` 같은 배포 접두사나 로컬 절대 경로를 데이터에 넣지 않습니다. `id`는 배열 내에서 고유하고 외부에서 참조해도 바뀌지 않는 영문 소문자·숫자·하이픈을 사용합니다.

## 섹션별 필드

| 콘텐츠 | 필수 필드 | 현재 용도 |
| --- | --- | --- |
| `site` | `brand`, `tagline`, `description` | 시안 이름·짧은 문구·문서 소개 |
| `hero` | `eyebrow`, `title`, `description`, `dayImage`, `nightImage` | 낮·밤 메인 풍경과 제목. 문구의 `\n`은 줄바꿈 |
| `clinicians[]` | `id`, `name`, `role`, `image`, `focus`, `description` | 의료진 이름·역할·사진·관심 진료 영역. `focus`는 문자열 |
| `departments[]` | `id`, `name`, `eyebrow`, `description`, `image` | 소개할 진료 분야와 가로 원화 |
| `reviews[]` | `id`, `alias`, `daysAgo`, `content` | 가상 후기. `daysAgo`는 한국 날짜 기준으로 오늘부터 지난 날짜 수 |
| `appointments[]` | `id`, `alias`, `time`, `status` | 가상 금일 예약 현황. 날짜는 화면에서 `Asia/Seoul` 기준으로 표시 |
| `spaces[]` | `id`, `name`, `description`, `image` | 공간 분위기를 표현한 원화. 실제 시설 사진으로 표시하지 않음 |
| `notices[]` | `title`, `label` | 실제 운영 정보가 아닌 안내 문구 예시 |
| `faq[]` | `question`, `answer` | 시안 기능에 대한 질문과 답변 |

의료진·진료 분야·후기·예약·공간 배열은 최소 한 항목이 필요합니다. 공지와 FAQ는 비울 수 있습니다. 항목 추가·삭제 시 PC와 모바일 배치도 확인하세요. 확인되지 않은 의료진 경력·자격·직함·진료 효과, 실제 주소·전화·진료시간을 임의로 입력하지 않습니다.

## 가상 후기와 금일 예약

후기의 `alias`는 성 한 글자와 별 두 개, `daysAgo`는 0 이상 정수입니다. 날짜를 오늘 기준으로 계산하므로 오래된 고정 날짜가 실제 후기처럼 보이지 않습니다.

```json
{
  "id": "review-example-01",
  "alias": "김**",
  "daysAgo": 0,
  "content": "상담 내용을 차분하게 들을 수 있었어요."
}
```

예약은 유효한 24시간 `HH:MM`과 `대기`, `진료 중`, `완료` 중 하나의 상태를 사용합니다. 화면의 합계는 이 배열에서 계산되며 현재 시간에 따라 실제 상태가 자동 갱신되지는 않습니다.

```json
{
  "id": "appointment-example-01",
  "alias": "김**",
  "time": "09:30",
  "status": "대기"
}
```

실제 환자의 이름·연락처·진료 내용이나 식별 가능한 예약을 이 공개 가능한 정적 파일에 넣지 않습니다. 실제 리뷰·예약 연동은 별도 서비스와 검토가 필요한 후속 작업입니다. UI의 예시 표시도 유지하세요.

## 이미지 준비와 교체

| 역할 | 현재 자산·규격 | 교체할 때 |
| --- | --- | --- |
| 메인 낮·밤 | `assets/art/hero-day.webp`, `hero-night.webp` · 각각 1672×941 | 두 장의 구도와 글자 뒤 여백을 맞춥니다. 작은 화면의 중심 구도도 확인합니다. |
| 진료 분야·공간 배경 | `assets/art/clinic-morning-gate.webp`, `healing-courtyard.webp`, `medical-apothecary.webp`, `herb-garden.webp` · 각각 1672×941 | 가로 16:9에 가까운 충분한 해상도의 원화를 사용합니다. 실제 시설 사진 여부를 정확히 설명합니다. |
| 조재성 원장 | `assets/clinicians/jo-jaeseong.png` · 515×515 투명 PNG | 원본 인물 식별이 유지되는 사진을 사용합니다. |
| 김석영 원장 | `assets/clinicians/kim-seokyoung.png` · 326×343 투명 PNG | 초상 비율과 투명 배경을 유지하고 확대 시 화질을 확인합니다. |

기존 이미지는 해당 프로젝트의 원본 파일에서 **바이트 변경 없이 복사**했습니다. 원화는 실제 한의원의 시설을 촬영한 사진이 아닙니다. 의료진 사진은 사용자가 참고하도록 지정한 기존 한의원 사이트의 인물 사진입니다. 공개하거나 운영 사이트에 적용하기 전에 사진의 사용 범위·초상권과 다른 원화의 이용 범위를 확인합니다.

새 파일로 교체할 때는 다음 순서로 작업합니다.

1. 파일을 `assets/` 아래에 넣고 `data/content.json`의 이미지 경로를 바꿉니다. 파일명과 대소문자를 정확히 맞춥니다.
2. `assets/provenance.json`에 해당 경로, 결과 SHA-256과 바이트 수, 실제 출처·설명·변환 사항을 기록합니다. 새 자산은 기존 원본 커밋에서 왔다고 표시하지 않습니다.
3. 검증과 빌드를 실행해 누락 경로·해시를 확인합니다. 변경하지 않은 자산을 무조건 재해시하지 않습니다.
4. 최종 화면에서 이미지 잘림, 명도, 대체 텍스트와 텍스트 대비를 확인합니다.

원본 이력의 `source.repository`, `source.revision`, `source.path`, `referenceUrl`, `matchesRevision`은 복사 시점의 기록입니다. 원본 파일을 교체하거나 수정했다면 실제 새 출처와 변환 방법을 별도로 기록하고 `matchesRevision`을 사실에 맞게 바꿉니다.

## 검증·실행

Python 3.10 이상과 Node.js 18 이상을 준비합니다. Windows에서 저장소 루트 기준:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe tools/build.py --check
.venv/Scripts/python.exe -m unittest discover -s tests -v
.venv/Scripts/python.exe tools/build.py --base-path /suan-clinic-demo/
.venv/Scripts/python.exe tools/verify.py --base-path /suan-clinic-demo/
.venv/Scripts/python.exe tools/preview.py --port 8080 --base-path /suan-clinic-demo/
```

미리보기 주소는 `http://127.0.0.1:8080/suan-clinic-demo/`입니다. macOS/Linux에서는 `.venv/Scripts/python.exe` 대신 `.venv/bin/python`을 사용합니다. GitHub 프로젝트 경로가 다르면 세 명령에 같은 `--base-path /저장소명/`을 전달합니다.

수정 후에는 360·390·768·1024·1440px 이상에서 가로 넘침, 사진 초점, 모바일 메뉴, 슬라이더, 키보드와 확대 창의 Escape·초점 복귀, 움직임 줄이기를 확인합니다. 저장소 업로드나 Pages 배포는 별도 작업이며 빌드 명령만으로 공개되지 않습니다.
