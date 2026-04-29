const READ_ONLY_COMMANDS = Object.freeze({
  accountList: {
    segments: ["account", "list"]
  },
  accountSummary: {
    segments: ["account", "summary"]
  },
  portfolioPositions: {
    segments: ["portfolio", "positions"]
  },
  portfolioAllocation: {
    segments: ["portfolio", "allocation"]
  },
  ordersList: {
    segments: ["orders", "list"]
  },
  ordersCompleted: {
    segments: ["orders", "completed"],
    buildExtraArgs(options = {}) {
      return ["--market", normalizeMarket(options.market || "all")];
    }
  },
  watchlistList: {
    segments: ["watchlist", "list"]
  },
  quoteGet: {
    segments: ["quote", "get"],
    buildExtraArgs(options = {}) {
      return [normalizeSymbol(options.symbol)];
    }
  },
  quoteBatch: {
    segments: ["quote", "batch"],
    buildExtraArgs(options = {}) {
      return normalizeSymbols(options.symbols);
    }
  },
  authDoctor: {
    segments: ["auth", "doctor"]
  }
});

function assertReadOnlyCommandName(commandName) {
  if (!READ_ONLY_COMMANDS[commandName]) {
    throw new Error(`Unsupported read-only tossctl command: ${commandName}`);
  }

  return commandName;
}

function buildReadOnlyArgs(commandName, options = {}) {
  const resolvedName = assertReadOnlyCommandName(commandName);
  const spec = READ_ONLY_COMMANDS[resolvedName];
  const args = ["--output", "json"];

  if (options.configDir) {
    args.push("--config-dir", String(options.configDir));
  }

  if (options.sessionFile) {
    args.push("--session-file", String(options.sessionFile));
  }

  args.push(...spec.segments);

  if (typeof spec.buildExtraArgs === "function") {
    args.push(...spec.buildExtraArgs(options));
  }

  return args;
}

function parseJsonOutput(stdout, commandName) {
  const text = String(stdout || "").trim();

  if (!text) {
    throw new Error(`tossctl ${commandName} returned empty output.`);
  }

  try {
    return {
      commandName,
      data: JSON.parse(text)
    };
  } catch (error) {
    throw new Error(
      `Failed to parse tossctl JSON output for ${commandName}: ${error.message}`,
      { cause: error }
    );
  }
}

function normalizeMarket(value) {
  const market = String(value || "").trim().toLowerCase();

  if (!["all", "us", "kr"].includes(market)) {
    throw new Error(`market must be one of all, us, kr. Received: ${value}`);
  }

  return market;
}

function normalizeSymbol(value) {
  const symbol = String(value || "").trim();

  if (!symbol) {
    throw new Error("symbol is required.");
  }

  return symbol;
}

function normalizeSymbols(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("symbols must be a non-empty array.");
  }

  return values.map(normalizeSymbol);
}

module.exports = {
  READ_ONLY_COMMANDS,
  assertReadOnlyCommandName,
  buildReadOnlyArgs,
  parseJsonOutput
};
