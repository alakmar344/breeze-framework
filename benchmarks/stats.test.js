const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { median, mean, stddev, percentile, summarize } = require('./stats.js');

describe('Benchmark stats helpers', () => {
  it('computes median for odd/even inputs', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), 0);
  });

  it('computes sample standard deviation', () => {
    assert.equal(stddev([5]), 0);
    assert.equal(stddev([]), 0);
    // [2,4,4,4,5,5,7,9]: mean 5, sample sd ≈ 2.138
    assert.ok(Math.abs(stddev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
  });

  it('computes percentiles and clamps', () => {
    assert.equal(percentile([1, 2, 3, 4], 95), 4);
    assert.equal(percentile([1, 2, 3, 4], 50), 2);
    assert.equal(percentile([], 95), 0);
  });

  it('summarizes noisy hardware samples with n and raw values', () => {
    const s = summarize([15, 18, 25]);
    assert.equal(s.n, 3);
    assert.equal(s.median, 18);
    assert.equal(s.min, 15);
    assert.equal(s.max, 25);
    assert.equal(s.p95, 25);
    assert.ok(s.sd > 0);
    assert.deepEqual(s.samples, [15, 18, 25]);
  });

  it('drops non-finite samples', () => {
    const s = summarize([10, NaN, Infinity, 20]);
    assert.equal(s.n, 2);
    assert.equal(s.median, 15);
  });

  it('mean of empty input is zero', () => {
    assert.equal(mean([]), 0);
    assert.equal(mean([2, 4]), 3);
  });
});
