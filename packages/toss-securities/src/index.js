const childProcess = require("node:child_process");
const util = require("node:util");

const {
  buildReadOnlyArgs,
  parseJsonOutput
} = require("./parse");

const execFile = util.promisify(childProcess.execFile);
const SESSION_EXPIRED_PATTERN = /stored session is no longer valid|validation_error/iu;

class TossSessionExpiredError extends Error {
  constructor(message, details = {}) {
    super(message, { cause: details.cause });
    this.name = "TossSessionExpiredError";
    this.details = details;
  }
}

function buildReadOnlyCommand(commandName, options = {}) {
  return {
    bin: options.bin || "tossctl",
    args: buildReadOnlyArgs(commandName, options)
  };
}

function shouldVerifySessionOnEmpty(commandName, options = {}) {
  if (options.verifySessionOnEmpty === false) {
    return false;
  }

  return commandName === "portfolioPositions" || commandName === "watchlistList";
}

function isConfirmedInvalidSession(doctor) {
  return doctor?.data?.session?.valid === false;
}

function buildSessionExpiredError(commandName, result, doctor, emptyKind) {
  return new TossSessionExpiredError(
    `tossctl ${commandName} returned ${emptyKind} while session is invalid. Run \`tossctl auth login\`.`,
    {
      commandName,
      stderr: String(result.stderr || "").trim(),
      doctor: doctor.data
    }
  );
}

function enrichQuote403Message(commandName, detail) {
  const text = String(detail || "");
  const isQuote = commandName === "quoteGet" || commandName === "quoteBatch";

  if (!isQuote) {
    return text;
  }

  if (/search\/stocks/iu.test(text) && /403/.test(text)) {
    return `${text} | Upstream hint: if this recurs, report to https://github.com/JungHoonGhae/tossinvest-cli/issues/15 with timestamp and symbol.`;
  }

  return text;
}

async function checkSession(options = {}) {
  const result = await runReadOnlyCommand("authDoctor", {
    ...options,
    verifySessionOnEmpty: false
  });

  return result;
}

async function getConfirmedInvalidSession(options = {}) {
  try {
    const doctor = await checkSession(options);
    if (isConfirmedInvalidSession(doctor)) {
      return doctor;
    }
  } catch {
    // Treat doctor execution/parsing failures as inconclusive. Empty portfolio
    // and watchlist responses should only become TossSessionExpiredError when
    // auth doctor returns parsed data that explicitly confirms invalid session.
  }

  return null;
}

async function runReadOnlyCommand(commandName, options = {}) {
  const command = buildReadOnlyCommand(commandName, options);

  try {
    const result = await execFile(command.bin, command.args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer || 1024 * 1024
    });

    if (shouldVerifySessionOnEmpty(commandName, options) && !String(result.stdout || "").trim()) {
      const doctor = await getConfirmedInvalidSession(options);
      if (doctor) {
        throw buildSessionExpiredError(commandName, result, doctor, "empty output");
      }
    }

    const parsed = parseJsonOutput(result.stdout, commandName);

    if (shouldVerifySessionOnEmpty(commandName, options) && Array.isArray(parsed.data) && parsed.data.length === 0) {
      const doctor = await getConfirmedInvalidSession(options);
      if (doctor) {
        throw buildSessionExpiredError(commandName, result, doctor, "empty array");
      }
    }

    return {
      ...command,
      ...parsed,
      stderr: result.stderr
    };
  } catch (error) {
    if (error instanceof TossSessionExpiredError) {
      throw error;
    }

    const stderr = String(error.stderr || "").trim();
    const detail = enrichQuote403Message(commandName, stderr || error.message);

    if (SESSION_EXPIRED_PATTERN.test(detail)) {
      throw new TossSessionExpiredError(`tossctl ${commandName} failed: ${detail}`, {
        commandName,
        stderr,
        cause: error
      });
    }

    throw new Error(`tossctl ${commandName} failed: ${detail}`, {
      cause: error
    });
  }
}

function listAccounts(options = {}) {
  return runReadOnlyCommand("accountList", options);
}

function getAccountSummary(options = {}) {
  return runReadOnlyCommand("accountSummary", options);
}

function getPortfolioPositions(options = {}) {
  return runReadOnlyCommand("portfolioPositions", options);
}

function getPortfolioAllocation(options = {}) {
  return runReadOnlyCommand("portfolioAllocation", options);
}

function listOrders(options = {}) {
  return runReadOnlyCommand("ordersList", options);
}

function listCompletedOrders(options = {}) {
  return runReadOnlyCommand("ordersCompleted", options);
}

function listWatchlist(options = {}) {
  return runReadOnlyCommand("watchlistList", options);
}

function getQuote(symbol, options = {}) {
  return runReadOnlyCommand("quoteGet", {
    ...options,
    symbol
  });
}

function getQuoteBatch(symbols, options = {}) {
  return runReadOnlyCommand("quoteBatch", {
    ...options,
    symbols
  });
}

module.exports = {
  buildReadOnlyCommand,
  checkSession,
  getAccountSummary,
  getPortfolioAllocation,
  getPortfolioPositions,
  getQuote,
  getQuoteBatch,
  listAccounts,
  listCompletedOrders,
  listOrders,
  listWatchlist,
  runReadOnlyCommand,
  TossSessionExpiredError
};
