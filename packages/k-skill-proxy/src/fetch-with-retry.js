const DEFAULT_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 150;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || (Number.isInteger(status) && status >= 500 && status <= 599);
}

function isRetryableError(error) {
  if (!error) {
    return false;
  }
  const name = error.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return true;
  }
  const code = error.code || error.cause?.code;
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "UND_ERR_SOCKET" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return true;
  }
  const message = String(error.message || "");
  return /fetch failed|ECONNRESET|aborted due to timeout|network/i.test(message);
}

async function discardBody(response) {
  if (!response) {
    return;
  }
  try {
    if (response.body && typeof response.body.cancel === "function") {
      response.body.cancel();
      return;
    }
    if (typeof response.arrayBuffer === "function") {
      await response.arrayBuffer();
    }
  } catch {
    // Best-effort drain so the next attempt can start cleanly.
  }
}

async function fetchWithRetry(url, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    attempts = DEFAULT_ATTEMPTS,
    backoffMs = DEFAULT_BACKOFF_MS,
    jitterRatio = 0.25,
    sleep = delay,
    retryOnStatus = isRetryableStatus,
    ...fetchOptions
  } = options;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const maxAttempts = Math.max(1, Number(attempts) || DEFAULT_ATTEMPTS);
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, fetchOptions);
      const shouldRetry = retryOnStatus(response.status) && attempt < maxAttempts - 1;
      if (!shouldRetry) {
        return response;
      }
      lastError = new Error(`upstream HTTP ${response.status}`);
      await discardBody(response);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
    }

    // A shared deadline (the caller's `AbortSignal.timeout`) that already fired
    // cannot succeed on another attempt, and its backoff would push the total
    // request time past the caller's timeout budget; stop retrying immediately.
    if (fetchOptions.signal?.aborted) {
      break;
    }

    const baseDelay = backoffMs * (attempt + 1);
    const jitter = jitterRatio > 0 ? Math.floor(Math.random() * baseDelay * jitterRatio) : 0;
    await sleep(baseDelay + jitter);
  }

  throw lastError || new Error("upstream request failed.");
}

module.exports = {
  DEFAULT_ATTEMPTS,
  DEFAULT_BACKOFF_MS,
  delay,
  fetchWithRetry,
  isRetryableError,
  isRetryableStatus
};
