'use strict';

const TOTAL_FRAMES = 100;
const DB_COUNT = 50;

function generateData() {
  const dbs = new Array(DB_COUNT);
  for (let i = 0; i < DB_COUNT; i++) {
    const queries = new Array(5);
    for (let q = 0; q < 5; q++) {
      const elapsed = Math.random() * 15;
      queries[q] = {
        elapsed: elapsed.toFixed(2),
        query: 'SELECT count(*) FROM table_' + (q + 1) + ' WHERE id = ' + Math.floor(Math.random() * 1000),
        warn: elapsed > 10 ? 'elapsed_warn_heavy' : (elapsed > 5 ? 'elapsed_warn_short' : 'elapsed_normal')
      };
    }
    dbs[i] = {
      id: i + 1,
      name: 'cluster_' + (i + 1),
      count: 5,
      q0: queries[0].elapsed,
      q1: queries[1].elapsed,
      q2: queries[2].elapsed,
      q3: queries[3].elapsed,
      q4: queries[4].elapsed,
      queries: queries
    };
  }
  return dbs;
}

function startBenchmarkLoop(renderCallback) {
  let frameCount = 0;
  const frameDurations = [];
  let lastTime = performance.now();
  const startTime = lastTime;

  function tick() {
    const now = performance.now();
    const frameDelta = now - lastTime;
    lastTime = now;
    frameDurations.push(frameDelta);

    const data = generateData();
    renderCallback(data);
    frameCount++;

    const meter = document.getElementById('fps-meter');
    if (meter) {
      const currentFps = Math.round(1000 / (frameDelta || 16.6));
      meter.textContent = `FPS: ${currentFps} (${frameCount}/${TOTAL_FRAMES})`;
    }

    if (frameCount < TOTAL_FRAMES) {
      requestAnimationFrame(tick);
    } else {
      const totalElapsed = performance.now() - startTime;
      // Drop first frame (warmup)
      const sampled = frameDurations.slice(1);
      const avgFrameTime = (sampled.reduce((a, b) => a + b, 0) / sampled.length);
      const fps = parseFloat((1000 / avgFrameTime).toFixed(1));
      const droppedFrames = sampled.filter(d => d > 16.67).length;

      window.__DBMONSTER_RESULTS__ = {
        totalElapsed: parseFloat(totalElapsed.toFixed(1)),
        avgFrameTime: parseFloat(avgFrameTime.toFixed(2)),
        fps: fps,
        droppedFrames: droppedFrames,
        totalFrames: sampled.length
      };

      if (meter) {
        meter.textContent = `FINAL FPS: ${fps} (Avg: ${avgFrameTime.toFixed(1)}ms)`;
      }
    }
  }

  // Warmup one render, then start
  renderCallback(generateData());
  setTimeout(() => {
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }, 100);
}
