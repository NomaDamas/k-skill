const LOVEBUG_BASE_URL = "https://xn--2i0bt2q2wd1wb.com"
const SUPABASE_URL = "https://sewrbxfawkmusnyzjoab.supabase.co"
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3JieGZhd2ttdXNueXpqb2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDAzODAsImV4cCI6MjA5MzUxNjM4MH0.jOzkBBdRPQFvAhvgc2SvSfWDnEQCouFS2AXvJoAikrY"
const DEFAULT_HISTORICAL_YEAR = 2026
const DEFAULT_TIMEOUT_MS = 20000
const DEFAULT_DEVICE_HASH_NAMESPACE = "lovebug-report"

const LEVEL_LABELS = {
  0: "잠잠해요",
  1: "살짝 보임",
  2: "많아요",
  3: "매우 많아요"
}

const SCORE_LABELS = {
  0: "지금은 조용해요",
  1: "조금 보여요",
  2: "꽤 많이 보여요",
  3: "엄청 많아요, 조심!"
}

const ADVISORY_LABELS = {
  0: "평상시 활동 OK",
  1: "베란다 조명 끄면 도움돼요",
  2: "외출 시 주의, 창문 방충망 점검",
  3: "외출/환기 자제 권장, 흰 옷 피하기"
}

const CONTEXT_LABELS = {
  indoor: "실내",
  street: "길거리",
  park: "공원",
  transit: "지하철·버스",
  shop: "상가",
  other: "기타"
}

const CONTEXT_ALIASES = new Map([
  ["indoor", "indoor"],
  ["inside", "indoor"],
  ["실내", "indoor"],
  ["집", "indoor"],
  ["건물안", "indoor"],
  ["street", "street"],
  ["road", "street"],
  ["outdoor", "street"],
  ["outside", "street"],
  ["길거리", "street"],
  ["길", "street"],
  ["실외", "street"],
  ["바깥", "street"],
  ["park", "park"],
  ["공원", "park"],
  ["transit", "transit"],
  ["subway", "transit"],
  ["bus", "transit"],
  ["지하철", "transit"],
  ["버스", "transit"],
  ["지하철버스", "transit"],
  ["지하철·버스", "transit"],
  ["지하철ㆍ버스", "transit"],
  ["shop", "shop"],
  ["store", "shop"],
  ["상가", "shop"],
  ["가게", "shop"],
  ["매장", "shop"],
  ["other", "other"],
  ["기타", "other"]
])

module.exports = {
  ADVISORY_LABELS,
  CONTEXT_ALIASES,
  CONTEXT_LABELS,
  DEFAULT_DEVICE_HASH_NAMESPACE,
  DEFAULT_HISTORICAL_YEAR,
  DEFAULT_TIMEOUT_MS,
  LEVEL_LABELS,
  LOVEBUG_BASE_URL,
  SCORE_LABELS,
  SUPABASE_ANON_KEY,
  SUPABASE_REST_URL,
  SUPABASE_URL
}
