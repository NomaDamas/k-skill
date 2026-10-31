#!/bin/sh
# usage: gen.sh  -> writes tapes/<name>.tape for each demo
cd "$(dirname "$0")"
gen() {
cat > "$1.tape" <<TAPE
Output raw/$1.mp4
Set Shell "zsh"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 17
Set Width 1920
Set Height 1080
Set Padding 16
Set Framerate 30
Set Theme "Catppuccin Mocha"
Set TypingSpeed 70ms
Hide
Type "cd /tmp/demo && clear && omp --model openrouter/z-ai/glm-5.3-flash --no-session"
Enter
Wait+Screen@90s /Connected to MCP/
Sleep 1s
Show
Sleep 1s
Type "$2"
Sleep 800ms
Enter
Sleep 70s
TAPE
}
gen 01-bccard-eatpl "강남역 근처 맛집 3곳만 추천해줘. 한 줄씩 짧게."
gen 02-kbo "KBO 한국시리즈 최근 경기 결과 3줄로 요약해줘"
gen 03-business-registration "사업자등록번호 1208800767 영업 상태만 확인해줘"
gen 04-real-estate "서초구 래미안퍼스티지 최근 매매 실거래가 3건만 알려줘"
gen 05-law "근로기준법 제60조 연차휴가 1항만 알려줘"
