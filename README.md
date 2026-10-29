# 수안부부한의원 홈페이지 시안

기존 의맥전기 인트로의 동양적 풍경과 스크롤 연출을 바탕으로 만든 **독립 정적 데모**입니다. 한의원 소개·진료분야·의료진·최근 리뷰·금일 예약 현황·방문 안내를 볼 수 있습니다.

리뷰와 예약 현황은 **가상의 예시 데이터**입니다. 날짜는 한국 시간으로 표시하지만 실제 예약 정보를 불러오지 않습니다. 예약·전화·상담 버튼은 “준비 중입니다.”를 표시하며 개인정보를 수집하거나 전송하지 않습니다. 실제 진료 안내로 사용하려면 사실 확인과 별도 서비스 연결이 필요합니다.

## 로컬 실행

Python 3.10 이상과 Node.js 18 이상이 필요합니다. 게임 서버·DB·계정이나 PVP 원본 프로젝트는 필요하지 않습니다.

```powershell
git clone https://github.com/is2js/suan-clinic-demo.git
cd suan-clinic-demo
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe tools/build.py --check
.venv/Scripts/python.exe -m unittest discover -s tests -v
.venv/Scripts/python.exe tools/build.py
.venv/Scripts/python.exe tools/verify.py
.venv/Scripts/python.exe tools/preview.py --port 8080
```

`http://127.0.0.1:8080/`에서 확인하고 Ctrl+C로 종료합니다. macOS/Linux에서는 `.venv/Scripts/python.exe`를 `.venv/bin/python`으로 바꿉니다. ES module을 사용하므로 HTML 파일을 직접 열지 말고 HTTP 서버로 확인합니다.

프로젝트 사이트의 하위 경로도 같은 방식으로 확인할 수 있습니다.

```powershell
.venv/Scripts/python.exe tools/build.py --base-path /suan-clinic-demo/
.venv/Scripts/python.exe tools/verify.py --base-path /suan-clinic-demo/
.venv/Scripts/python.exe tools/preview.py --port 8080 --base-path /suan-clinic-demo/
```

주소는 `http://127.0.0.1:8080/suan-clinic-demo/`입니다. `dist/`는 생성 결과이며 수정 대상이 아닙니다. `build.py`는 자신이 만든 결과 폴더만 교체하며, 소유 표시가 없는 비어 있지 않은 디렉터리는 덮어쓰지 않습니다.

## 데이터와 이미지 변경

| 파일 | 역할 |
| --- | --- |
| `data/content.json` | 브랜드·인물·진료분야·시설·후기·예약 시안의 실제 빌드 입력 |
| `schema/content.schema.json` | 필수 필드와 데이터 형식 |
| `assets/` | 선별한 원화·사진과 CSS |
| `assets/provenance.json` | 이미지의 원본 저장소/경로·출처·크기·SHA-256 |
| `templates/index.html`, `src/site.mjs` | 독립 페이지의 구성과 상호작용 |
| [데이터 가이드](docs/data-guide.ko.md) | 섹션별 필드·이미지 규격·교체 방법 |

UTF-8 JSON으로 작성합니다. 이미지 경로는 `assets/`로 시작하는 저장소 상대 경로로 쓰고, Pages 접두사는 데이터에 넣지 않습니다. 서비스 기능은 실제 진료와 연결되지 않은 예시이므로 연락처나 환자 정보를 추가하지 마세요.

문구만 바꿀 때는 `data/content.json`을 편집한 뒤 `tools/build.py --check`, 빌드, `tools/verify.py`를 다시 실행합니다. 새 이미지를 넣거나 기존 이미지를 교체하면 이미지별 `assets/provenance.json`의 `path`, `bytes`, `sha256`, 출처·변환 설명도 해당 파일에 맞게 갱신합니다. **직접 확인한 이미지의 기록만** 변경하며 원본 파일의 제작 이력을 구분해 보존합니다.

예를 들어 새로운 `assets/custom/clinic.webp`의 크기와 SHA-256을 확인하려면 다음처럼 실행합니다.

```powershell
@'
from pathlib import Path
import hashlib
path = Path("assets/custom/clinic.webp")
data = path.read_bytes()
print("bytes:", len(data))
print("sha256:", hashlib.sha256(data).hexdigest())
'@ | .venv/Scripts/python.exe -X utf8 -
```

검사에서 해시 불일치·파일 누락·경로 대소문자 오류가 나면 해당 파일과 provenance의 기록을 대조합니다. 모든 파일 해시를 일괄 승인하지 않습니다. 새 한글이 기존 부분집합 폰트에 없으면 시스템 대체 글꼴이 적용될 수 있으므로 PC와 모바일에서 확인하세요.

## GitHub Pages 배포

프로젝트 사이트 주소는 `https://is2js.github.io/suan-clinic-demo/`입니다. 저장소의 Pages Source는 GitHub Actions이며, `main` push 또는 수동 실행 시 `.github/workflows/pages.yml`이 데이터·자산 검사, 회귀 검사, 하위 경로 빌드·검증을 거쳐 **`dist/`만** 배포합니다. 배포는 [Actions 실행 기록](https://github.com/is2js/suan-clinic-demo/actions/workflows/pages.yml)의 build와 deploy 성공 및 공개 주소에서 확인합니다.

다른 저장소에서 사용할 때 `--base-path /<저장소명>/`으로 로컬 검증하고 해당 저장소의 Pages 설정과 이미지 사용 권한을 확인하세요. `main`에 push하면 공개 사이트가 변경되므로 작업 브랜치에서 확인한 뒤 반영합니다. 배포 중 빌드가 실패하면 이전 성공 배포를 유지합니다.

## 자료 출처와 범위

의료진 사진은 사용자가 지정한 참고 사이트의 기존 자료를, 동양 판타지 배경은 의맥전기 소개 자산을 사용합니다. 개별 파일의 출처와 변환 여부는 `assets/provenance.json`에 기록합니다. 사진에 나타난 개인 및 원본 이미지의 재사용·공개 권한은 원본 소유자의 범위에 따릅니다.

이 저장소는 시각 및 기능 시안입니다. 진료정보를 실제 운영에 반영하기 전 의료진, 진료분야, 주소, 연락처, 영업시간, 후기 출처와 예약 서비스 연결을 확인해야 합니다.
