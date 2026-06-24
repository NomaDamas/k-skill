const {
  CALENDARS,
  GENDERS,
  REQUIRED_INTERVIEW_FIELDS,
  UNSUPPORTED_LUNAR_CONVERSION_MESSAGE
} = require("./constants");

function getMissingInterviewFields(input = {}) {
  return REQUIRED_INTERVIEW_FIELDS.filter((field) => !input[field]);
}

function normalizeBirthInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("birth input is required.");
  }

  const birthDate = normalizeString(input.birthDate);
  const birthTime = normalizeString(input.birthTime);
  const gender = normalizeString(input.gender);
  const calendar = normalizeString(input.calendar) || "solar";

  if (!birthDate) {
    throw new Error("birthDate is required.");
  }
  if (!isValidDate(birthDate)) {
    throw new Error("birthDate must be YYYY-MM-DD.");
  }
  if (birthTime && !isValidTime(birthTime)) {
    throw new Error("birthTime must be HH:mm.");
  }
  if (!gender || !GENDERS.has(gender)) {
    throw new Error("gender must be male or female.");
  }
  if (!CALENDARS.has(calendar)) {
    throw new Error("calendar must be solar or lunar.");
  }

  return {
    name: normalizeString(input.name) || undefined,
    hanjaName: normalizeString(input.hanjaName) || undefined,
    birthDate,
    birthTime: birthTime || undefined,
    calendar,
    isLeapMonth: Boolean(input.isLeapMonth),
    gender,
    birthCity: normalizeString(input.birthCity) || undefined
  };
}

function convertCalendar(args) {
  const date = normalizeString(args.date);
  const fromCalendar = normalizeString(args.fromCalendar);
  const toCalendar = normalizeString(args.toCalendar);

  if (!date || !isValidDate(date)) {
    throw new Error("date must be YYYY-MM-DD.");
  }
  if (!CALENDARS.has(fromCalendar) || !CALENDARS.has(toCalendar)) {
    throw new Error("fromCalendar and toCalendar must be solar or lunar.");
  }

  if (fromCalendar === toCalendar) {
    return {
      originalDate: date,
      originalCalendar: fromCalendar,
      convertedDate: date,
      convertedCalendar: toCalendar,
      isLeapMonth: Boolean(args.isLeapMonth),
      note: "동일한 달력 체계라 변환하지 않았습니다."
    };
  }

  throw new Error(UNSUPPORTED_LUNAR_CONVERSION_MESSAGE);
}

function rejectUnsupportedLunarInput(input) {
  if (input.calendar === "lunar") {
    throw new Error(UNSUPPORTED_LUNAR_CONVERSION_MESSAGE);
  }
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function parseTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const { year, month, day } = parseDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const { hour, minute } = parseTime(value);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  convertCalendar,
  getMissingInterviewFields,
  normalizeBirthInput,
  normalizeString,
  parseDate,
  parseTime,
  rejectUnsupportedLunarInput,
  todayIsoDate
};
