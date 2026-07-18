"use strict"

const STATUS_URL = "https://ev.or.kr/nportal/buySupprt/initSubsidyPaymentCheckAction.do"
const MODEL_SUBSIDY_PATH = "/nportal/buySupprt/psPopupLocalCarModelPrice.do"

const VEHICLE_TYPES = Object.freeze({
  passenger: Object.freeze({
    key: "passenger",
    label: "전기승용",
    carTypeCode: "11",
    aliases: ["passenger", "car", "승용", "전기승용", "전기차"]
  }),
  cargo: Object.freeze({
    key: "cargo",
    label: "전기화물",
    carTypeCode: "12",
    aliases: ["cargo", "truck", "화물", "전기화물"]
  }),
  bus: Object.freeze({
    key: "bus",
    label: "전기승합",
    carTypeCode: "13",
    aliases: ["bus", "van", "승합", "전기승합"]
  })
})

const SIDO_ALIASES = Object.freeze({
  서울: ["서울", "서울시", "서울특별시"],
  부산: ["부산", "부산시", "부산광역시"],
  대구: ["대구", "대구시", "대구광역시"],
  인천: ["인천", "인천시", "인천광역시"],
  광주: ["광주", "광주시", "광주광역시"],
  대전: ["대전", "대전시", "대전광역시"],
  울산: ["울산", "울산시", "울산광역시"],
  세종: ["세종", "세종시", "세종특별자치시"],
  경기: ["경기", "경기도"],
  강원: ["강원", "강원도", "강원특별자치도"],
  충북: ["충북", "충청북도"],
  충남: ["충남", "충청남도"],
  전북: ["전북", "전라북도", "전북특별자치도"],
  전남: ["전남", "전라남도"],
  경북: ["경북", "경상북도"],
  경남: ["경남", "경상남도"],
  제주: ["제주", "제주도", "제주특별자치도"]
})

function resolveVehicleType(value) {
  const normalized = String(value || "passenger").trim().toLowerCase()
  for (const definition of Object.values(VEHICLE_TYPES)) {
    if (definition.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return definition
    }
  }
  const error = new Error(`지원하지 않는 차종입니다: ${value}`)
  error.code = "VEHICLE_TYPE_NOT_AVAILABLE"
  throw error
}

module.exports = {
  MODEL_SUBSIDY_PATH,
  SIDO_ALIASES,
  STATUS_URL,
  VEHICLE_TYPES,
  resolveVehicleType
}
