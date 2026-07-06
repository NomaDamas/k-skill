const BASE_URL = "https://www.yebigun1.mil.kr";
const HOME_URL = `${BASE_URL}/`;
const TRAINING_INFO_PATH = "/dmobis/rfh/rgt/edutrasubjpsn/IvdTraScheDetail.do";
const TRAINING_INFO_URL = `${BASE_URL}${TRAINING_INFO_PATH}`;

const YEBIGUN_ENDPOINTS = {
  base: BASE_URL,
  home: HOME_URL,
  trainingInfo: TRAINING_INFO_PATH,
};

const APPLICATION_MENUS = {
  selfSelect: { label: "훈련일정 자율선택", mode: "click" },
  nationalUnit: { label: "전국단위 훈련신청", mode: "click" },
  holiday: { label: "휴일예비군 훈련신청", mode: "click" },
  delay: { label: "훈련 연기신청", mode: "goto", path: "/dmobis/rft/rgt/ivdTraDelayApplInForm.do" },
  hold: { label: "보류 신청", mode: "goto", path: "/dmobis/rfh/rrm/holdpsn/HoldPsnReqForm.do" },
  holdCancel: { label: "해소 신청", mode: "goto", path: "/dmobis/rfh/rrm/holdpsn/HoldPsnCancelReqForm.do" },
  editProfile: { label: "개인정보수정", mode: "goto", path: "/dmobis/rfh/rrm/reserveforce/ReserveForceForm.do" },
  honors: { label: "예비군 상훈", mode: "goto", path: "/dmobis/rfh/rrm/reserveforce/ReserveForcePrzdcr.do" },
};

const VIEW_MENUS = {
  applicationResults: { label: "훈련신청 결과", path: "/dmobis/rfh/rgt/edutrasubjpsn/NationalUnitResevForcesTraRltList.do" },
  delayResults: { label: "연기신청 결과", path: "/dmobis/rft/rgt/ivdTraDelayApplRltList.do" },
  holdResults: { label: "보류·해소 신청결과", path: "/dmobis/rfh/rrm/holdpsn/HoldPsnReqRsltList.do" },
  holidaySchedule: { label: "휴일예비군 훈련일정 조회", path: "/dmobis/rfh/rgt/edutrasubjpsn/HolidayTrainingScheduleList.do" },
  unitNotices: { label: "소속부대 공지사항", path: "/dmobis/rfh/mpt/mypubannoun/MyPubAnnounList.do" },
  trainingNotices: { label: "훈련안내", path: "/dmobis/rfh/mpt/tranotice/TraNoticeList.do" },
  myQna: { label: "나의 질의응답", path: "/dmobis/rfh/mpt/myquestans/MyQuestAnsList.do" },
  unitFinder: { label: "예비군부대 찾기", path: "/dmobis/rfh/mpt/mytroopfind/listAdminAddr.do" },
};

module.exports = {
  APPLICATION_MENUS,
  BASE_URL,
  HOME_URL,
  TRAINING_INFO_PATH,
  TRAINING_INFO_URL,
  VIEW_MENUS,
  YEBIGUN_ENDPOINTS,
};
