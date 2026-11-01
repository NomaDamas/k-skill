"use strict";

/** 입력 오류·조회 실패를 코드와 함께 알리는 오류. CLI 와 amendmentTable 이 같은 형식으로 출력한다. */
class AmendmentError extends Error {
  /**
   * @param {string} message
   * @param {string} code INVALID_PARAM | NOT_FOUND | UPSTREAM
   * @param {string[]} [hints]
   */
  constructor(message, code, hints = []) {
    super(message);
    this.name = "AmendmentError";
    this.code = code;
    this.hints = hints;
  }
}

module.exports = { AmendmentError };
