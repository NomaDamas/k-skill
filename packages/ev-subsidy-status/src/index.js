"use strict"

const { getSubsidyStatus: getSubsidyStatusBrowser, searchRegions: searchRegionsBrowser } = require("./browser")
const { getSubsidyStatusHttp, searchRegionsHttp } = require("./http")
const { STATUS_URL, VEHICLE_TYPES, resolveVehicleType } = require("./constants")
const { EvSubsidyError } = require("./errors")
const { classifyAvailability } = require("./availability")
const { buildUnavailableBudget, estimateModelEquivalent } = require("./estimate")
const {
  attachModelEstimate,
  buildStatusResult,
  formatKst,
  normalizeRegionKey,
  normalizeText,
  parseModelSubsidyRows,
  parseMoneyKrw,
  parseNumberCell,
  parseStatusRows
} = require("./parse")

function browserRequested(options = {}) {
  return options.transport === "browser" ||
    Boolean(options.page || options.runtime || options.provider || options.cdpUrl)
}

async function getSubsidyStatus(options = {}) {
  return browserRequested(options)
    ? getSubsidyStatusBrowser(options)
    : getSubsidyStatusHttp(options)
}

async function searchRegions(options = {}) {
  return browserRequested(options)
    ? searchRegionsBrowser(options)
    : searchRegionsHttp(options)
}

module.exports = {
  EvSubsidyError,
  STATUS_URL,
  VEHICLE_TYPES,
  attachModelEstimate,
  buildStatusResult,
  buildUnavailableBudget,
  classifyAvailability,
  estimateModelEquivalent,
  formatKst,
  getSubsidyStatus,
  getSubsidyStatusBrowser,
  getSubsidyStatusHttp,
  normalizeRegionKey,
  normalizeText,
  parseModelSubsidyRows,
  parseMoneyKrw,
  parseNumberCell,
  parseStatusRows,
  resolveVehicleType,
  searchRegions,
  searchRegionsBrowser,
  searchRegionsHttp
}
