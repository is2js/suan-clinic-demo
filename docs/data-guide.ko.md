# 수안 인트로 데이터·이미지 가이드

## 변경 원칙

`data/content.json`이 독립 빌드의 입력입니다. UTF-8 JSON으로 저장하고 `tools/build.py --check`, 빌드, `tools/verify.py`, 브라우저 검수를 순서대로 실행합니다. `data/authored/`는 RPG 원본의 참고 기록이므로 편집해도 현재 화면에는 반영되지 않습니다. 기존 PVP와 의맥전기 저장소는 변경하지 않습니다.

주소는 `/assets/...`로 시작하는 저장소 기준 경로로 작성합니다. 빌더가 `/suan-clinic-demo/` 같은 Pages 접두사를 적용합니다. 실제로 표시되는 목록과 섹션 설정에 비슷한 값이 중복되는 경우 두 위치를 함께 수정합니다. 새 자산은 `export-manifest.json`에 정확한 대소문자 경로와 SHA-256, 크기를 기록하고 이미지 출처는 `assets/provenance.json`에도 기록합니다.

## 섹션과 데이터

| 구간 | 편집 위치 | 준비할 내용과 이미지 |
| --- | --- | --- |
| 첫 화면 | `brand`, `site.brand`, `sections.visual` | 한의원명·소개 문구와 낮/밤 풍경. 투명 인물과 기존 레이어는 별도 이미지 |
| 한의원 소개 | `universe`, `sections.universe.items` | 소개 문구와 가로 풍경 5개, 각 이미지의 `alt`·설명. 실제 시설 사진이 아니라면 시안이라고 표시 |
| 의료진 | `actors`, `sections.character.actorCopy` | 남녀 의료진 2명. `name`, `role`, `description`, `portrait`, `image`를 함께 수정. 사진 원본과 이용 범위 기록 |
| 최근 후기 | `clinicDemo.reviews` | 다섯 가상 후기의 별명·내용·상대 날짜. 빌드 시 후기 카드와 메뉴에 자동 반영. 카드 배경은 `features`와 `sections.features.items`에서 관리 |
| 의료 스킬 | `medical.skills`, `sections.gamefeatures` | 치료 항목 이름·설명·아이콘과 시연용 스프라이트. 실제 치료 효과나 확정적 결과를 주장하지 않음 |
| 함께하는 진료 | `guild`, `sections.sect.items` | 세 장면의 배경과 문구. `motionActors`의 스프라이트는 기존 모션 |
| 진료 항목 | `elements`, `sections.skill` | 네 분류별 두 항목. 이미지와 설명을 바꾸되 시연 프레임·효과 타이밍을 유지 |
| 예약 현황 | `clinicDemo.appointments`, `sections.clinic` | `id`, `alias`, `time`, `status`와 예시 표기. 날짜는 한국 시간 기준 표시 |
| 안내 | `guide`, `sections.guide` | 주인공 일러스트·안내 카드 2개와 서비스 버튼 문구 |
| 미디어 | `gallery`, `sections.media.items` | 6개 원화와 확대용 이미지·대체 문구. 시설 실사진이 아닌 풍경은 구분 |
| 이용 안내 | `sections.access`, `clinicDemo.notices`, `clinicDemo.faq` | 사실 확인된 운영 정보만 입력. 미확인 연락처·주소는 준비 중으로 남김 |

캐릭터 스프라이트와 의료진 초상화는 별도입니다. `actors[*].portrait`과 `image`의 사진을 바꾸어도 `sprite`·`encounter`는 건드리지 않으면 마을 장면의 대기 및 선택 모션이 유지됩니다. 남성 사진은 `assets/clinicians/jo-jaeseong.png`(515×515), 여성 사진은 `assets/clinicians/kim-seokyoung.png`(326×343)이며 원본 출처는 `assets/provenance.json`을 확인하세요. 화면에 맞추는 크롭은 스타일에서 처리합니다.

## 예시 예약·후기

시안에서는 실명·환자 정보를 넣지 않습니다. 별명은 한글 한 글자와 `**`, 시간은 `HH:MM`, 상태는 `대기`, `진료 중`, `완료` 중 하나입니다. 화면의 건수와 상태별 합계는 같은 예약 배열에서 계산합니다. `clinicDemo.sampleNotice`, `appointmentNotice`, `reviewNotice`에는 예시임을 명확히 씁니다.

```json
{
  "appointments": [{"id": "example-01", "alias": "김**", "time": "09:30", "status": "대기"}],
  "reviews": [{"id": "review-01", "alias": "박**", "daysAgo": 1, "content": "예시 후기 문구"}],
  "sampleNotice": "예약과 후기는 실제 정보가 아닌 시안 예시입니다.",
  "appointmentNotice": "금일 예약은 실제 정보가 아닌 가상의 예시입니다.",
  "reviewNotice": "후기는 실제 이용 후기가 아닌 가상의 예시입니다."
}
```

후기 `daysAgo`는 표시 기준 날짜에서 뺄 일수입니다. 실제 예약 접수·사용자 정보 저장·환자 조회 기능은 이 정적 시안에 없습니다.

후기를 바꿀 때는 `clinicDemo.reviews`의 별명·내용·`daysAgo`만 편집하고 다시 빌드합니다. 빌더가 각 후기의 순서에 맞춰 카드 이름·본문·날짜 및 가상 예시 표시와 상단 메뉴 이름을 채웁니다. 기존 다섯 카드의 이미지·ID·순서는 유지되므로 후기 개수는 카드 개수와 같아야 하며 각 후기 ID는 중복될 수 없습니다. `features`와 `sections.features.items`의 카드 ID 및 메뉴 항목 순서는 서로 일치해야 합니다.

## 이미지·자산 교체

1. 사용 권한을 확인한 이미지를 `assets/` 안에 넣고, 데이터의 경로와 대체 텍스트를 바꿉니다. 새 사진은 충분한 해상도와 얼굴이 잘리지 않는 구도를 준비하세요.
2. 이미지의 출처·파일 크기·해시·가로세로 크기를 `assets/provenance.json`에 기록합니다. 기존 원화의 출처는 `export-manifest.json`의 원본 경로를 확인하세요.
3. `export-manifest.json`의 `files`에 새 자산을 추가하거나 변경 파일의 `bytes`와 `sha256`을 갱신합니다. `assetBytes`도 실제 포함된 자산 합계에 맞춥니다. 해시는 아래 명령으로 확인합니다.
4. `--check`, 테스트, 빌드와 정적 검증을 실행하고 PC·모바일에서 사진, 선택 동작과 예시 안내를 확인합니다.

```powershell
Get-FileHash assets/clinicians/jo-jaeseong.png -Algorithm SHA256
(Get-Item assets/clinicians/jo-jaeseong.png).Length
.venv/Scripts/python.exe tools/build.py --check
.venv/Scripts/python.exe -m unittest discover -s tests -v
.venv/Scripts/python.exe tools/build.py --base-path /suan-clinic-demo/
.venv/Scripts/python.exe tools/verify.py --base-path /suan-clinic-demo/
```

직접 수정하지 않은 자산의 출처나 해시를 임의로 바꾸지 않습니다. RPG 인트로 재내보내기를 수안 작업 폴더에 바로 실행하면 수안 데이터가 덮어써질 수 있습니다. 원본의 이후 변경은 별도로 비교해 필요한 부분만 수안 저장소에 반영하세요.
