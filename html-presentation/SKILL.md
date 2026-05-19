---
name: html-presentation
description: AI가 콘텐츠만 작성하면 키보드 네비·사이드 네비·풀스크린 no-scroll이 보장되는 단일 HTML 발표자료(슬라이드 덱)를 생성하는 스킬. PPT 대체용 웹 기반 슬라이드.
license: MIT
metadata:
  category: utility
  locale: ko-KR
  phase: v1
---

## 개요

**html-presentation**은 외부 프레임워크 의존성 없이 `file://` 더블클릭만으로 동작하는 단일 HTML 슬라이드 덱을 생성합니다.

**핵심 원칙**: 엔진(불변) + 콘텐츠(AI 작성)의 엄격한 분리.

### 산출물 구조

```
{output_dir}/
├── index.html          # AI가 콘텐츠를 채운 완성 덱
└── engine/
    ├── engine.css      # 불변 스타일 (수정 금지)
    └── engine.js       # 불변 동작 (수정 금지)
```

---

## 입력 계약

| 필드 | 필수 | 타입 | 기본값 | 설명 |
|------|:----:|------|--------|------|
| `topic` | 필수 | string | — | 발표 주제 |
| `audience` | 필수 | string | — | 청중 (예: "스타트업 CTO") |
| `slide_count` | 필수 | int | — | 슬라이드 수 |
| `resolution` | 선택 | string | `"1920x1080"` | 캔버스 크기 (`WxH`) |
| `theme` | 선택 | `"light"` \| `"dark"` | `"light"` | 색상 테마 |
| `tone` | 선택 | string | `"전문적"` | 콘텐츠 어조 |
| `output_dir` | 선택 | path | `./presentation-{topic-slug}/` | 출력 디렉토리 |

---

## AI 워크플로우

다음 단계를 순서대로 실행합니다.

### Step 1. 입력 파싱

```
topic, audience, slide_count 검증
resolution → stage-w, stage-h 분리 (예: "1920x1080" → 1920px, 1080px)
output_dir 결정 (없으면 topic을 kebab-case slug로 변환)
```

### Step 2. 출력 디렉토리 생성

```bash
mkdir -p {output_dir}/engine
```

### Step 3. 엔진 파일 복사

스킬 베이스 디렉토리의 `engine/` 폴더를 `{output_dir}/engine/` 에 복사합니다.

```bash
cp engine/engine.css {output_dir}/engine/engine.css
cp engine/engine.js  {output_dir}/engine/engine.js
```

### Step 4. index.html 생성

`template.html` 을 기반으로 다음 항목을 치환합니다:

- `{{TITLE}}` → topic
- `--stage-w` / `--stage-h` → resolution 값
- `data-theme` → theme 값 (`"light"` 또는 `"dark"`)

### Step 5. 슬라이드 콘텐츠 채우기

`<!-- SLIDES:START -->` ~ `<!-- SLIDES:END -->` 사이에 `slide_count` 개의 슬라이드를 작성합니다.

- 각 슬라이드는 아래 **레이아웃 카탈로그** 중 1개 사용
- topic, audience, tone 에 맞는 실제 콘텐츠 작성
- 추천 구성: cover(1) → section(구간 표시) → bullets/two-col/statement/code/image(본문) → end(1)

---

## 레이아웃 카탈로그 (8종)

각 레이아웃은 DOM 계약을 정확히 준수해야 합니다. 엔진 CSS가 자식 선택자로 스타일을 적용합니다.

### 1. cover — 표지 슬라이드

```html
<section data-layout="cover" data-title="제목">
  <h1>발표 제목</h1>
  <p class="subtitle">부제 · 날짜 · 발표자</p>
</section>
```

중앙 정렬. 첫 번째 슬라이드에 사용.

### 2. section — 섹션 구분

```html
<section data-layout="section" data-title="섹션명">
  <span class="section-num">01</span>
  <h1>섹션 제목</h1>
</section>
```

좌측 정렬, 대형 섹션 번호. 챕터 구분에 사용.

### 3. bullets — 글머리 목록

```html
<section data-layout="bullets" data-title="슬라이드 제목">
  <header>
    <h1>제목</h1>
    <h2 class="subtitle">부제(선택)</h2>
  </header>
  <ul>
    <li>항목 1</li>
    <li>항목 2</li>
    <!-- 최대 6개 권장 -->
  </ul>
</section>
```

### 4. two-col — 2열 비교

```html
<section data-layout="two-col" data-title="슬라이드 제목">
  <header><h1>제목</h1></header>
  <div class="col">
    <h2>좌측 헤딩</h2>
    <ul>
      <li>항목</li>
    </ul>
  </div>
  <div class="col">
    <h2>우측 헤딩</h2>
    <ul>
      <li>항목</li>
    </ul>
  </div>
</section>
```

각 열 항목 최대 5개 권장.

### 5. statement — 강조 메시지

```html
<section data-layout="statement" data-title="슬라이드 제목">
  <blockquote>한 문장 강조 메시지</blockquote>
  <cite>— 출처(선택)</cite>
</section>
```

중앙 정렬, 대형 인용구. 핵심 메시지 전달에 사용.

### 6. image — 이미지 + 캡션

```html
<section data-layout="image" data-title="슬라이드 제목">
  <header><h1>제목</h1></header>
  <figure>
    <img src="path/to/image.png" alt="설명">
    <figcaption>캡션</figcaption>
  </figure>
</section>
```

이미지 placeholder: `https://placehold.co/1600x800`

### 7. code — 코드 예시

```html
<section data-layout="code" data-title="슬라이드 제목">
  <header><h1>제목</h1></header>
  <pre><code class="language-typescript">// 코드 (최대 14줄 권장)
const example = "hello";</code></pre>
</section>
```

highlight.js CDN이 자동으로 구문 강조를 적용합니다.
지원 언어: `language-typescript`, `language-javascript`, `language-python`, `language-go`, `language-rust`, `language-bash`, `language-json` 등.

### 8. end — 마무리 슬라이드

```html
<section data-layout="end" data-title="끝">
  <h1>감사합니다</h1>
  <dl class="meta">
    <dt>연락처</dt><dd>email@example.com</dd>
    <dt>슬라이드</dt><dd>github.com/username/repo</dd>
    <dt>웹사이트</dt><dd>https://example.com</dd>
  </dl>
</section>
```

중앙 정렬. 마지막 슬라이드에 사용.

---

## AI 작성 규칙

### MUST (절대 준수)

- 엔진이 모든 슬라이드 우하단에 footer를 자동 주입한다("made by baekenough" + GitHub/LinkedIn 아이콘). AI는 footer를 작성하지 않는다.
- `engine/engine.css`, `engine/engine.js` **수정 금지**
- 슬라이드는 `<!-- SLIDES:START -->` ~ `<!-- SLIDES:END -->` **사이에만** 작성
- 각 슬라이드에 `data-layout`(8종 중 1) + `data-title`(네비 라벨) **필수**
- 레이아웃 DOM 계약을 **정확히** 준수 (잘못된 자식 구조 → 레이아웃 깨짐)
- **예약 변수 외 새 CSS 변수 추가 금지** (`:root` 블록에는 `--stage-w`, `--stage-h`, 테마 변수만)
- 사용자 `slide_count`만큼 슬라이드 작성
- `<style>` 블록의 `--stage-w`/`--stage-h`를 resolution에 맞춰 **1회만** 설정

### SHOULD (강력 권장)

- 콘텐츠 예산: bullets ≤ 6개, two-col 단별 ≤ 5개, code ≤ 14줄
- 16:9가 아닌 해상도 → 예산 비례 조정 (예: 4:3이면 더 짧게)
- 테마 변경 시 `<style>` 블록 `:root`의 예약 변수만 수정
- 슬라이드 흐름: cover → (section) → 본문 → end
- 각 슬라이드는 단일 메시지에 집중

### MAY (선택)

- 슬라이드 내부에서 `<strong>`, `<em>`, `<a>` 등 인라인 마크업 사용
- `data-theme="dark"` 를 `<html>` 태그에 설정하여 다크 테마 적용

---

## 디버그 모드

URL에 `?debug=1` 파라미터 추가:

```
file:///path/to/index.html?debug=1
```

슬라이드별 오버플로우 감지:
- `scrollHeight > clientHeight` 또는 `scrollWidth > clientWidth` 시 빨간 outline 표시
- `console.warn` 으로 슬라이드 제목 + 크기 정보 출력

---

## 키보드 단축키

| 키 | 동작 |
|----|------|
| `Space` | 다음 슬라이드 |
| `Shift + Space` | 이전 슬라이드 |
| `→` / `PageDown` | 다음 슬라이드 |
| `←` / `PageUp` | 이전 슬라이드 |
| `Home` | 첫 번째 슬라이드 |
| `End` | 마지막 슬라이드 |
| `N` | 사이드 네비게이션 토글 |
| `F` | 풀스크린 토글 |

터치 스와이프(모바일): 좌→우 이전, 우→좌 다음

---

## 기술 사양

| 항목 | 값 |
|------|-----|
| 외부 의존성 | Pretendard CDN, JetBrains Mono CDN, highlight.js CDN |
| 오프라인 동작 | 폰트/highlight.js 미로드 시 system-ui fallback으로 동작 |
| 브라우저 지원 | Chrome/Edge 88+, Firefox 85+, Safari 14+ |
| 최소 해상도 | 제한 없음 (transform scale로 자동 적응) |
| 파일 크기 | engine.css + engine.js ≈ 10KB (minify 전) |

---

## 예제 실행

```bash
# 스킬 호출 예시 (oh-my-customcode 환경)
topic: "2026년 AI 에이전트 트렌드"
audience: "스타트업 CTO"
slide_count: 8
resolution: "1920x1080"
theme: "light"
output_dir: "./my-presentation/"
```

완성된 `index.html` 을 브라우저에서 직접 열거나(`file://`), 로컬 서버로 서빙합니다.

샘플: `samples/ai-agent-trends-2026/index.html`
