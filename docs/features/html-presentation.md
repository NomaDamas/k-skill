# HTML 발표자료 생성 가이드

## 이 기능으로 할 수 있는 일

- 발표 주제·청중·슬라이드 수만 알려주면 완성된 HTML 발표자료(슬라이드 덱) 생성
- 키보드 네비게이션·사이드 패널·풀스크린 no-scroll이 자동 보장되는 PPT 대체 웹 슬라이드 제작
- 라이트/다크 테마 및 해상도(1920×1080, 1440×1080, 2560×1080 등)를 입력으로 지정
- 8종 레이아웃(cover, section, bullets, two-col, statement, image, code, end) 조합으로 전문적인 덱 구성
- `file://` 더블클릭만으로 오프라인 동작 — 별도 서버, 설치, 빌드 단계 불필요

## 먼저 알아둘 점

- **외부 JS/CSS 프레임워크 의존성 0**: 엔진은 바닐라 HTML+CSS+JS로 자급형 스캐폴드입니다. 단, 웹폰트(Pretendard, JetBrains Mono) 및 코드 하이라이터(highlight.js)는 CDN에서 로드합니다.
- **`file://` 더블클릭으로 동작**: 슬라이드 콘텐츠는 `index.html`에 인라인으로 작성되므로 별도 fetch 없이 오프라인에서도 열립니다.
- **엔진(불변) + 콘텐츠(AI 작성)의 엄격한 분리**: AI는 콘텐츠 영역(`<!-- SLIDES:START -->` ~ `<!-- SLIDES:END -->`)만 채웁니다. 엔진 파일(`engine.css`, `engine.js`)은 절대 수정하지 않습니다.
- **footer는 엔진이 자동 주입**: "made by baekenough" 텍스트와 GitHub·LinkedIn 아이콘이 자동으로 삽입되며, AI는 별도로 작성하지 않습니다.

## 입력 계약

| 필드 | 필수/선택 | 설명 |
|------|-----------|------|
| `topic` | 필수 | 발표 주제 (예: "2026년 AI 에이전트 트렌드") |
| `audience` | 필수 | 청중 (예: "스타트업 CTO", "대학원생") |
| `slide_count` | 필수 | 슬라이드 개수 (상한 없음, 사용자 책임) |
| `resolution` | 선택 | 캔버스 크기 — 예: `"1920x1080"`, `"1440x1080"`, `"2560x1080"`. 기본값 `1920x1080` |
| `theme` | 선택 | `"light"` 또는 `"dark"`. 기본값 `"light"` |
| `tone` | 선택 | 콘텐츠 어조 (예: "전문적", "캐주얼"). 기본값 `"전문적"` |
| `output_dir` | 선택 | 출력 디렉토리 경로. 기본값 `./presentation-{topic-slug}/` |

## 산출물

스킬 실행 후 다음 구조의 디렉토리가 생성됩니다.

```
presentation-{slug}/
├── index.html          # AI가 콘텐츠를 채운 완성 덱 (브라우저에서 열기)
└── engine/
    ├── engine.css      # 불변 스타일 (수정 금지)
    └── engine.js       # 불변 동작 (수정 금지)
```

`index.html`을 브라우저에서 직접 열거나 로컬 서버로 서빙하면 됩니다.

### 키보드 단축키

| 키 | 동작 |
|----|------|
| `Space` / `→` / `PageDown` | 다음 슬라이드 |
| `Shift+Space` / `←` / `PageUp` | 이전 슬라이드 |
| `Home` | 첫 번째 슬라이드 |
| `End` | 마지막 슬라이드 |
| `N` | 사이드 네비게이션 패널 토글 |
| `F` | 풀스크린 토글 |

터치 스와이프(모바일): 좌→우 이전, 우→좌 다음.

## 데모

- AI 에이전트 트렌드 2026 (라이트 테마): https://samples-weld.vercel.app/ai-agent-trends-2026/index.html
- Hermes Agent 소개 (다크 + 골드 액센트): https://samples-weld.vercel.app/hermes-agent/index.html

> 데모 인덱스: https://samples-weld.vercel.app/

## 사용 예시

### 예시 1 — 기본 호출 (라이트 테마, 1920×1080)

```
topic: "2026년 AI 에이전트 트렌드"
audience: "스타트업 CTO"
slide_count: 8
```

결과: `./presentation-2026-ai-agent-trends/index.html` 생성.

### 예시 2 — 다크 테마, 비표준 해상도

```
topic: "Hermes Agent 아키텍처"
audience: "백엔드 엔지니어"
slide_count: 12
resolution: "1440x1080"
theme: "dark"
tone: "기술적"
output_dir: "./hermes-deck/"
```

결과: `./hermes-deck/index.html` 생성. 4:3 비율로 콘텐츠 예산이 자동 조정됩니다.

## 디버그 모드

URL에 `?debug=1` 파라미터를 추가하면 디버그 모드가 활성화됩니다.

```
file:///path/to/presentation/index.html?debug=1
```

콘텐츠가 슬라이드 영역을 벗어나는 경우 해당 슬라이드에 빨간 outline이 표시되고 콘솔에 경고가 출력됩니다. 슬라이드가 잘릴 것 같다면 이 모드로 먼저 확인하세요.

## 실패 모드

- **폰트 CDN 차단 환경**: Pretendard/JetBrains Mono 로드 실패 시 `system-ui` fallback으로 동작합니다. 폰트 품질만 저하되며 레이아웃은 유지됩니다.
- **highlight.js CDN 차단**: 코드 슬라이드(`data-layout="code"`)가 plain text로 표시됩니다. 구문 강조만 없어지고 내용은 그대로입니다.
- **콘텐츠 예산 초과**: 슬라이드 콘텐츠가 캔버스를 벗어나면 시각적으로는 잘릴 수 있습니다. `?debug=1` 모드에서 빨간 outline으로 식별하고, 해당 슬라이드의 항목 수를 줄이거나 슬라이드를 분할하세요.
- **네트워크 없는 완전 오프라인 환경**: 폰트·하이라이터 CDN 모두 차단되더라도 슬라이드 구조와 네비게이션은 정상 동작합니다.

## 한계 (v1 범위 밖)

v1에서는 아래 기능을 지원하지 않습니다. 향후 버전에서 검토 예정입니다.

- 발표자 노트 / 프레젠터 뷰
- PDF 내보내기
- 슬라이드 전환 애니메이션 커스터마이징
- 빌드(점진 등장) 애니메이션
- 슬라이드별 개별 해상도 (덱 전체 단일 해상도만 지원)
