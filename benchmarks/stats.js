#!/usr/bin/env node
/**
 * Shared statistics helpers for Breeze benchmark runners (zero dependencies).
 * Every Chrome workload reports median + p95 + min/max + sd instead of a bare
 * median, so noisy low-end hardware produces defensible distributions.
 */

'use strict';

function sortNums(arr) {
  return [...arr].sort((a, b) => a - b);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = sortNums(arr);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Sample standard deviation (n-1). Returns 0 for <2 samples. */
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1));
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = sortNums(arr);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

/**
 * Full distribution summary. Keeps raw samples (rounded to 2dp) so
 * benchmarks/results.json stays auditable.
 */
function summarize(samples) {
  const clean = (samples || []).filter(v => typeof v === 'number' && isFinite(v));
  return {
    n: clean.length,
    median: +median(clean).toFixed(2),
    p95: +percentile(clean, 95).toFixed(2),
    min: clean.length ? +Math.min(...clean).toFixed(2) : 0,
    max: clean.length ? +Math.max(...clean).toFixed(2) : 0,
    sd: +stddev(clean).toFixed(2),
    samples: clean.map(v => +v.toFixed(2))
  };
}

module.exports = { median, mean, stddev, percentile, summarize };
