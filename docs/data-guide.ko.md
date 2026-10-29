# 수안 인트로 데이터·이미지 가이드

## 변경 원칙

`data/content.json`이 독립 빌드의 입력입니다. UTF-8 JSON으로 저장하고 `tools/build.py --check`, 빌드, `tools/verify.py`, 브라우저 검수를 순서대로 실행합니다. `data/authored/`는 RPG 원본의 참고 기록이므로 편집해도 현재 화면에는 반영되지 않습니다. 기존 PVP와 의맥전기 저장소는 변경하지 않습니다.

주소는 `/assets/...`로 시작하는 저장소 기준 경로로 작성합니다. 빌더가 `/suan-clinic-demo/` 같은 Pages 접두사를 적용합니다. 실제로 표시되는 목록과 섹션 설정에 비슷한 값이 중복되는 경우 두 위치를 함께 수정합니다. 새 자산은 `export-manifest.json`에 정확한 대소문자 경로와 SHA-256, 크기를 기록하고 이미지 출처는 `assets/provenance.json`에도 기록합니다.

## 섹션과 데이터

| 구간 | 편집 위치 | 준비할 내용과 이미지 |
| --- | --- | --- |
| 첫 화면 | `brand`, `site.brand`, `sections.visual` | 한의원명·소개 문구와 낮/밤 풍경. 투명 인물과 기존 레이어는 별도 이미지 |
| 예약 | `clinicDemo.appointments`, `sections.clinic` | 첫 화면 다음의 금일 예약 예시. 이름·시간·상태는 가상 데이터로 관리 |
| 공지사항 | `clinicDemo.notices` | 예약 다음의 독립 공지 섹션. 안내·소식은 실제 운영 공지가 아닌 예시 |
| 한의원 소개 | `universe`, `sections.universe.items` | 소개 문구와 가로 풍경 5개, 각 이미지의 `alt`·설명. 실제 시설 사진이 아니라면 시안이라고 표시 |
| 의료진 | `actors`, `sections.character.actorCopy` | 남녀 의료진 2명. `name`, `role`, `description`, `portrait`, `image`를 함께 수정. 사진 원본과 이용 범위 기록 |
| 최근 후기 | `clinicDemo.reviews` | 다섯 가상 후기의 별명·내용·상대 날짜. 빌드 시 후기 카드와 메뉴에 자동 반영. 카드 배경은 `features`와 `sections.features.items`에서 관리 |
| 의료 스킬 | `medical.skills`, `sections.gamefeatures` | 치료 항목 이름·설명·아이콘과 시연용 스프라이트. 실제 치료 효과나 확정적 결과를 주장하지 않음 |
| 함께하는 진료 | `guild`, `sections.sect.items` | 세 장면의 배경과 문구. `motionActors`의 스프라이트는 기존 모션 |
| 진료 항목 | `elements`, `sections.skill` | 네 분류별 두 항목. 이미지와 설명을 바꾸되 시연 프레임·효과 타이밍을 유지 |
| 커뮤니티 | `clinicDemo.community` | 게시판 이름·설명과 게시글 예시. 게시글과 게시판은 실제 운영하지 않음 |
| 한방 상품 | `clinicDemo.products` | 상품 소개 예시, 생성 원화와 상담 버튼. 판매·가격·구성 확인 전으로 표기 |
| 이용 안내 | `guide`, `sections.guide`, `clinicDemo.visitorGuides`, `clinicDemo.faq` | 진료시간·예약·첫 방문·오시는 길·주차·진료비와 서류. 미확인 정보는 준비 중으로 남김 |
| 한의원 둘러보기 | `clinicDemo.tour.items`, `clinicDemo.tour.notice` | 6개 공간 원화의 제목·설명·이미지·대체 문구. 빌드 시 갤러리와 메뉴에 반영 |
| 마지막 안내 | `sections.access` | 방문과 예약을 안내하는 마무리 문구 |

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

## 공지·커뮤니티와 상품 시안

`clinicDemo.notices`의 `label`, `title`은 공지 섹션에 표시되며 현재는 가상 예시입니다. `clinicDemo.community`의 `boards`는 각 게시판의 `id`, `title`, `description`, `posts`(각 `title`, `label`, `date`)로 구성합니다. 데이터의 `notice`에 실제 게시글이 아닌 예시임을 계속 표시합니다. 게시판 버튼은 “준비 중입니다.”를 안내하며 실제 읽기·쓰기나 서버 저장은 없습니다.

`clinicDemo.products.items`의 `id`, `name`, `category`, `description`, `image`, `alt`, `actionId`, `actionLabel`을 수정하면 상품 시안에 반영됩니다. 상품 이미지와 제품 정보가 실제 판매 제품이 아닌 시안임을 `clinicDemo.products.notice`와 이미지 대체 텍스트에 표시합니다. 공진단은 사용자 요청에 따른 예시로, 실제 취급 여부와 가격·구성은 확인되지 않았습니다. 효능이나 치료 결과를 추정하여 기재하지 않습니다. 모든 상품 버튼은 주문이나 결제 없이 “준비 중입니다.”를 표시합니다.

`assets/art/herbal-products-concept.png`, `herbal-jar-concept.png`, `herbal-decoction-concept.png`는 상품 분위기를 표현한 OpenAI 생성 원화로 실제 제품 사진이 아닙니다. 프롬프트와 해시는 `assets/provenance.json`을 참조하세요. 확인된 상품 사진으로 교체할 때는 사용 권한, 정보의 정확성 및 관련 표시를 검토합니다.

## 둘러보기와 방문 안내

`clinicDemo.tour.items`의 각 항목에서 `id`, `title`, `description`, `image`, `alt`를 편집합니다. 빌더가 같은 순서의 갤러리와 메뉴에 반영하므로 항목 수와 기존 갤러리·메뉴의 ID 순서를 맞춥니다. `clinicDemo.tour.notice`에는 실제 시설이 아닌 시안이라는 안내를 유지합니다. 현재 `assets/art/clinic-interior-concept.png`, `clinic-consult-concept.png`, `clinic-treatment-concept.png`는 OpenAI 이미지 생성으로 만든 가상의 한옥 실내 원화이며, 프롬프트·해시·크기 등은 `assets/provenance.json`에 기록되어 있습니다. 실제 시설 사진으로 교체할 때는 촬영 및 공개 사용 권한을 확인하세요.

`guide.stories`의 `href`는 페이지 내부 앵커로 작성합니다. 기본값은 첫 방문 `#visit-first`, 진료 이야기 `#gamefeatures`이며 변경한 앵커는 실제 섹션 ID와 일치해야 합니다. 푸터의 진료 안내와 예약 현황도 각각 `#gamefeatures`, `#clinic`으로 연결됩니다.

`clinicDemo.visitorGuides`의 `id`, `title`, `description`을 편집하면 이용 안내에 표시됩니다. 고정 `id`는 메뉴의 `href`와 연결되므로 변경할 때 함께 수정합니다. `actionId`와 `actionLabel`이 있는 항목의 버튼은 데모에서 “준비 중입니다.”를 표시합니다. 진료시간·주소·교통·주차·진료비·서류 정보는 확인되지 않은 상태에서 실제 정보처럼 적지 않습니다.

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
