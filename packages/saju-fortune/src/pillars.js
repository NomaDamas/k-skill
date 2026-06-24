const { BRANCHES, STEMS } = require("./constants");

function calculatePillars(dateParts, timeParts) {
  const year = calculateYearPillar(dateParts);
  const month = calculateMonthPillar(dateParts, year);
  const day = calculateDayPillar(dateParts);
  const hour = timeParts ? calculateHourPillar(timeParts, day) : null;

  return { year, month, day, hour };
}

function calculateYearPillar({ year, month, day }) {
  const sajuYear = month < 2 || (month === 2 && day < 4) ? year - 1 : year;
  return makePillar(mod(sajuYear - 4, 10), mod(sajuYear - 4, 12));
}

function calculateMonthPillar({ month, day }, yearPillar) {
  const monthIndex = getSolarTermMonthIndex(month, day);
  const branchIndex = mod(monthIndex + 2, 12);
  const yearStemIndex = yearPillar.stemIndex;
  let monthStemStart;

  if (yearStemIndex === 0 || yearStemIndex === 5) {
    monthStemStart = 2;
  } else if (yearStemIndex === 1 || yearStemIndex === 6) {
    monthStemStart = 4;
  } else if (yearStemIndex === 2 || yearStemIndex === 7) {
    monthStemStart = 6;
  } else if (yearStemIndex === 3 || yearStemIndex === 8) {
    monthStemStart = 8;
  } else {
    monthStemStart = 0;
  }

  const monthOffset = branchIndex >= 2 ? branchIndex - 2 : branchIndex + 10;
  return makePillar(mod(monthStemStart + monthOffset, 10), branchIndex);
}

function calculateDayPillar({ year, month, day }) {
  const base = Date.UTC(1900, 0, 1, 12);
  const birth = Date.UTC(year, month - 1, day, 12);
  const diffDays = Math.round((birth - base) / 86400000);

  return makePillar(mod(diffDays, 10), mod(10 + diffDays, 12));
}

function calculateHourPillar({ hour }, dayPillar) {
  const branchIndex = hour >= 23 || hour < 1 ? 0 : Math.floor((hour + 1) / 2);
  const stemIndex = mod(dayPillar.stemIndex * 2 + branchIndex, 10);

  return makePillar(stemIndex, branchIndex);
}

function makePillar(stemIndex, branchIndex) {
  const stem = STEMS[stemIndex];
  const branch = BRANCHES[branchIndex];

  return {
    label: `${stem.korean}${branch.korean}`,
    hanja: `${stem.hanja}${branch.hanja}`,
    stem: stem.korean,
    stemHanja: stem.hanja,
    stemElement: stem.element,
    stemElementKo: stem.elementKo,
    branch: branch.korean,
    branchHanja: branch.hanja,
    branchAnimal: branch.animal,
    branchElement: branch.element,
    branchElementKo: branch.elementKo,
    yinYang: stem.yinYang,
    stemIndex,
    branchIndex
  };
}

function getSolarTermMonthIndex(month, day) {
  const starts = [
    [2, 4],
    [3, 6],
    [4, 5],
    [5, 6],
    [6, 6],
    [7, 7],
    [8, 8],
    [9, 8],
    [10, 8],
    [11, 7],
    [12, 7],
    [1, 6]
  ];
  const value = month * 100 + day;

  for (let index = 10; index >= 0; index -= 1) {
    const [startMonth, startDay] = starts[index];
    if (value >= startMonth * 100 + startDay) {
      return index;
    }
  }

  return 11;
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  calculatePillars,
  clamp,
  mod
};
