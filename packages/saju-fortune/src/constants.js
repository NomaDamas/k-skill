const STEMS = [
  { korean: "갑", hanja: "甲", element: "wood", elementKo: "목", yinYang: "yang" },
  { korean: "을", hanja: "乙", element: "wood", elementKo: "목", yinYang: "yin" },
  { korean: "병", hanja: "丙", element: "fire", elementKo: "화", yinYang: "yang" },
  { korean: "정", hanja: "丁", element: "fire", elementKo: "화", yinYang: "yin" },
  { korean: "무", hanja: "戊", element: "earth", elementKo: "토", yinYang: "yang" },
  { korean: "기", hanja: "己", element: "earth", elementKo: "토", yinYang: "yin" },
  { korean: "경", hanja: "庚", element: "metal", elementKo: "금", yinYang: "yang" },
  { korean: "신", hanja: "辛", element: "metal", elementKo: "금", yinYang: "yin" },
  { korean: "임", hanja: "壬", element: "water", elementKo: "수", yinYang: "yang" },
  { korean: "계", hanja: "癸", element: "water", elementKo: "수", yinYang: "yin" }
];

const BRANCHES = [
  { korean: "자", hanja: "子", animal: "쥐", element: "water", elementKo: "수", yinYang: "yang", hourLabel: "23:00-01:00" },
  { korean: "축", hanja: "丑", animal: "소", element: "earth", elementKo: "토", yinYang: "yin", hourLabel: "01:00-03:00" },
  { korean: "인", hanja: "寅", animal: "호랑이", element: "wood", elementKo: "목", yinYang: "yang", hourLabel: "03:00-05:00" },
  { korean: "묘", hanja: "卯", animal: "토끼", element: "wood", elementKo: "목", yinYang: "yin", hourLabel: "05:00-07:00" },
  { korean: "진", hanja: "辰", animal: "용", element: "earth", elementKo: "토", yinYang: "yang", hourLabel: "07:00-09:00" },
  { korean: "사", hanja: "巳", animal: "뱀", element: "fire", elementKo: "화", yinYang: "yin", hourLabel: "09:00-11:00" },
  { korean: "오", hanja: "午", animal: "말", element: "fire", elementKo: "화", yinYang: "yang", hourLabel: "11:00-13:00" },
  { korean: "미", hanja: "未", animal: "양", element: "earth", elementKo: "토", yinYang: "yin", hourLabel: "13:00-15:00" },
  { korean: "신", hanja: "申", animal: "원숭이", element: "metal", elementKo: "금", yinYang: "yang", hourLabel: "15:00-17:00" },
  { korean: "유", hanja: "酉", animal: "닭", element: "metal", elementKo: "금", yinYang: "yin", hourLabel: "17:00-19:00" },
  { korean: "술", hanja: "戌", animal: "개", element: "earth", elementKo: "토", yinYang: "yang", hourLabel: "19:00-21:00" },
  { korean: "해", hanja: "亥", animal: "돼지", element: "water", elementKo: "수", yinYang: "yin", hourLabel: "21:00-23:00" }
];

const REQUIRED_INTERVIEW_FIELDS = ["birthDate", "birthTime", "gender"];
const ANALYSIS_TYPES = new Set(["basic", "fortune", "yongsin", "school_compare", "yongsin_method"]);
const FORTUNE_TYPES = new Set(["general", "career", "wealth", "health", "love"]);
const GENDERS = new Set(["male", "female"]);
const CALENDARS = new Set(["solar", "lunar"]);
const UNSUPPORTED_LUNAR_CONVERSION_MESSAGE = "lunar calendar conversion is not supported without a verified manse calendar table. Enter a solar/Gregorian birthDate or convert the lunar date before analysis.";

const ELEMENT_KO = {
  wood: "목",
  fire: "화",
  earth: "토",
  metal: "금",
  water: "수"
};

const ELEMENT_LABELS = {
  wood: "목(木)",
  fire: "화(火)",
  earth: "토(土)",
  metal: "금(金)",
  water: "수(水)"
};

const ELEMENT_CYCLE = ["wood", "fire", "earth", "metal", "water"];
const UNKNOWN_TIME_LIMITATION = "태어난 시간이 없어 시주는 확정하지 않고 연·월·일 중심으로 보수적으로 해석합니다.";

module.exports = {
  ANALYSIS_TYPES,
  BRANCHES,
  CALENDARS,
  ELEMENT_CYCLE,
  ELEMENT_KO,
  ELEMENT_LABELS,
  FORTUNE_TYPES,
  GENDERS,
  REQUIRED_INTERVIEW_FIELDS,
  STEMS,
  UNKNOWN_TIME_LIMITATION,
  UNSUPPORTED_LUNAR_CONVERSION_MESSAGE
};
