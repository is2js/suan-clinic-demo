# 수안부부한의원 인트로 시안

[공개 데모](https://is2js.github.io/suan-clinic-demo/)는 의맥전기 인트로의 템플릿·원화·레이어·스크롤 연출을 기반으로 콘텐츠를 바꾼 **독립 정적 시안**입니다. 기존 의맥전기·PVP 프로젝트와 실제 한의원 사이트를 수정하지 않습니다.

**금일 예약과 후기에는 가상 예시만 사용합니다.** 실제 환자 정보나 운영 일정과 무관하며, 예약·전화·상담 등 서비스 버튼은 “준비 중입니다.” 안내만 표시합니다. 주소·전화번호·진료시간은 확인 전에는 넣지 않습니다. 풍경은 분위기를 표현한 일러스트이며 실제 시설 사진이 아닙니다. 의료 장면과 스프라이트는 게임 기반의 시각적 시안으로 실제 시술 장면이 아닙니다.

## 사이트 구성

첫 화면 다음에 **금일 예약 예시와 공지사항**을 배치하고, 한의원 소개·의료진·후기·진료 항목·진료 과정을 이어서 보여줍니다. 이용 안내에서는 진료시간, 예약·상담, 첫 방문, 오시는 길, 주차 및 진료비·서류 안내를 살펴볼 수 있습니다. 각 메뉴의 세부 항목은 해당 안내로 바로 이동합니다.

`#media`의 **한의원 둘러보기**는 접수·상담·치료·약재 공간을 소개하는 슬라이더입니다. 실내 원화 `assets/art/clinic-interior-concept.png`, `clinic-consult-concept.png`, `clinic-treatment-concept.png`는 이번 시안을 위해 생성한 가상의 이미지이며 실제 시설 사진이 아닙니다. 원본과 생성 정보는 `assets/provenance.json`에 기록했습니다. 이미지나 설명을 교체할 때는 [데이터 가이드](docs/data-guide.ko.md)의 `clinicDemo.tour.items` 절차를 따릅니다.

## 로컬 실행

Python 3.10 이상, Node.js 18 이상이 필요합니다. 게임 서버·DB·로그인 없이 빌드합니다. 아래 명령은 Windows PowerShell 기준이며 macOS/Linux에서는 `.venv/bin/python`을 사용합니다.

```powershell
git clone https://github.com/is2js/suan-clinic-demo.git
cd suan-clinic-demo
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe tools/build.py --check
.venv/Scripts/python.exe -m unittest discover -s tests -v
.venv/Scripts/python.exe tools/build.py --base-path /suan-clinic-demo/
.venv/Scripts/python.exe tools/verify.py --base-path /suan-clinic-demo/
.venv/Scripts/python.exe tools/preview.py --port 8080 --base-path /suan-clinic-demo/
```

`http://127.0.0.1:8080/suan-clinic-demo/`에서 확인하고 Ctrl+C로 미리보기를 종료합니다. `dist/`는 빌드 산출물이며 직접 수정하지 않습니다. 빌더는 `.suan-demo-dist` 소유 표시가 있는 이전 산출물만 정리합니다. 다른 폴더를 출력 대상으로 지정할 때에도 표시 없는 비어 있지 않은 폴더는 덮어쓰지 않습니다.

## 콘텐츠와 자산

- `data/content.json`: 화면에 사용되는 최종 데이터. 브랜드, 11개 섹션, 두 의료진, 의료 스킬과 예시 예약·후기를 편집합니다.
- `data/authored/`: 원본에서 가져온 참고 스냅샷이며 독립 빌드 입력이 아닙니다.
- `templates/rpg-intro.html`, `assets/rpg/css/rpg-intro.css`, `src/rpg/`: 원본 인트로의 마크업, 스타일과 애니메이션을 바탕으로 한 수안 시안 전용 복사본.
- `schema/schema.json`: 데이터 형식과 예시 예약·후기 검증 규칙.
- `export-manifest.json`: 사용 파일의 출처와 해시. 새 이미지 또는 코드 교체 시 목록·해시·크기를 함께 갱신합니다.
- `assets/provenance.json`: 수안 시안에 추가한 의료진 사진과 배경 원화의 출처.
- [상세 데이터 가이드](docs/data-guide.ko.md): 섹션별 필드, 사진·배경 교체, 검증 방법.

실제 운영 데이터로 사용하기 전 의료진 정보, 진료 항목과 이미지 이용 범위, 관련 표시·연결 내용을 확인해야 합니다. 사진·원화 파일에는 이 저장소의 소스 코드와 별도의 이용 조건이 적용될 수 있습니다.

## 배포와 갱신

`main`에 푸시하면 `.github/workflows/pages.yml`이 데이터·자산 검사와 테스트를 실행한 후 검증된 `dist/`를 GitHub Pages에 배포합니다. 이 저장소의 Pages 주소는 `/suan-clinic-demo/` 하위 경로이므로 빌드와 검증에 같은 `--base-path`를 전달합니다. 다른 저장소에서 재사용하려면 자신의 저장소 이름으로 경로를 바꿉니다.

수정은 이 저장소에서 진행합니다. 의맥전기 데모를 다시 내보내면 수안 전용 데이터와 디자인 수정이 덮어써질 수 있으므로 직접 덮어쓰지 말고 변경점을 검토해 필요한 부분만 병합합니다.
