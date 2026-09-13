#!/usr/bin/env node
/**
 * Shared hardware/software/device disclosure for every Breeze benchmark
 * report. The #1 credibility problem with the previous benchmark system was
 * that absolute numbers were committed from one unreproducible machine with
 * no way for a reader to tell whether the environment was even a fair one
 * (e.g. a shared, multi-tenant cloud VM with noisy-neighbor CPU contention
 * produces very different numbers than a dedicated desktop). This module
 * captures everything material and — importantly — flags likely-virtualized
 * / shared-core environments instead of presenting them as if they were a
 * quiet, dedicated benchmarking rig.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

function safeExec(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (_) { return null; }
}

function detectVirtualization() {
  // Best-effort, Linux-focused heuristics. Never throws; returns
  // { virtualized: true|false|'unknown', hints: string[] }.
  const hints = [];
  let virtualized = 'unknown';

  const dv = safeExec('systemd-detect-virt 2>/dev/null');
  if (dv && dv !== 'none') { virtualized = true; hints.push(`systemd-detect-virt: ${dv}`); }
  else if (dv === 'none') { virtualized = false; }

  try {
    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    if (/^flags\s*:.*\bhypervisor\b/m.test(cpuinfo)) {
      virtualized = true;
      hints.push('/proc/cpuinfo flags contain "hypervisor"');
    }
  } catch (_) { /* not linux / not readable */ }

  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    if (/docker|kubepods|containerd/.test(cgroup)) {
      hints.push('/proc/1/cgroup indicates a container (docker/kubepods/containerd)');
    }
  } catch (_) { /* ignore */ }

  return { virtualized, hints };
}

/**
 * Full environment fingerprint for a benchmark run. Call once per process
 * and embed the result verbatim into every report/JSON output — every
 * number in a report must be traceable back to exactly this.
 */
function collectEnvInfo() {
  const cpus = os.cpus() || [];
  const virt = detectVirtualization();
  const gitCommit = safeExec('git rev-parse --short HEAD') || 'unknown';
  const gitDirty = safeExec('git status --porcelain') ? true : false;

  return {
    capturedAt: new Date().toISOString(),
    os: {
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      platform: os.platform()
    },
    cpu: {
      model: cpus[0] ? cpus[0].model.trim() : 'unknown',
      logicalCores: cpus.length,
      speedMHz: cpus[0] ? cpus[0].speed : null
    },
    memoryTotalGiB: +(os.totalmem() / (1024 ** 3)).toFixed(1),
    node: process.version,
    v8: process.versions.v8,
    git: { commit: gitCommit, dirty: gitDirty },
    virtualization: virt,
    // Set explicitly by CI or a human running locally; null means "unknown,
    // treat all absolute numbers here with proportionally more skepticism."
    thermalControlNotes: process.env.BZ_BENCH_ENV_NOTES || null
  };
}

/** One-paragraph human-readable summary for embedding in generated reports. */
function envInfoSummary(info) {
  const virtLine = info.virtualization.virtualized === true
    ? `⚠️  Likely virtualized/shared host (${info.virtualization.hints.join('; ') || 'heuristic match'}) — expect more run-to-run noise than a dedicated desktop/laptop.`
    : info.virtualization.virtualized === false
      ? 'No virtualization indicators detected (best-effort check).'
      : 'Virtualization status could not be determined on this OS.';

  return [
    `- **Date**: ${info.capturedAt}`,
    `- **OS**: ${info.os.type} ${info.os.release} (${info.os.arch})`,
    `- **CPU**: ${info.cpu.model} — ${info.cpu.logicalCores} logical cores`,
    `- **RAM**: ${info.memoryTotalGiB} GiB`,
    `- **Node.js**: ${info.node} (V8 ${info.v8})`,
    `- **Git commit**: ${info.git.commit}${info.git.dirty ? ' (dirty working tree)' : ''}`,
    `- **Environment**: ${virtLine}`
  ].join('\n');
}

module.exports = { collectEnvInfo, envInfoSummary, detectVirtualization };
