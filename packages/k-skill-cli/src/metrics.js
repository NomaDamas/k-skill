"use strict";

function inWindow(timestamp, start, end) {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) && value >= start && value < end;
}

function uniqueIds(events) {
  return new Set(events.map((event) => event.distinct_id).filter(Boolean)).size;
}

function deriveUsageMetrics(events, end = Date.now()) {
  const windows = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  const metrics = {};
  for (const [name, duration] of Object.entries(windows)) {
    const selected = events.filter((event) =>
      inWindow(event.timestamp, end - duration, end),
    );
    const uniqueUsers = uniqueIds(selected);
    metrics[name] = {
      calls: selected.length,
      uniqueUsers,
      executionsPerUniqueUser: uniqueUsers ? selected.length / uniqueUsers : 0,
    };
  }

  const recentIds = new Set(
    events
      .filter((event) => inWindow(event.timestamp, end - windows.weekly, end))
      .map((event) => event.distinct_id)
      .filter(Boolean),
  );
  const priorIds = new Set(
    events
      .filter((event) => inWindow(event.timestamp, end - 2 * windows.weekly, end - windows.weekly))
      .map((event) => event.distinct_id)
      .filter(Boolean),
  );
  metrics.recurrentUsers = [...recentIds].filter((id) => priorIds.has(id)).length;

  return metrics;
}

module.exports = { deriveUsageMetrics };
