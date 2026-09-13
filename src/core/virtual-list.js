  // ── Pure Virtual-List Math Helper (Safe in Node & Browser) ───────────
  export function calculateVirtualWindow(opts) {
    const options = opts || {};
    const scrollTop = Math.max(0, options.scrollTop || 0);
    const viewportHeight = Math.max(0, options.viewportHeight != null ? options.viewportHeight : 400);
    const totalCount = Math.max(0, options.totalCount || 0);
    const itemHeight = Math.max(1, options.itemHeight || 40);
    const overscan = Math.max(0, options.overscan != null ? options.overscan : 3);
    const totalHeight = totalCount * itemHeight;

    if (totalCount === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        visibleCount: 0,
        totalHeight: 0,
        offsetY: 0
      };
    }

    const rawStart = Math.floor(scrollTop / itemHeight);
    const startIndex = Math.max(0, rawStart - overscan);
    const rawEnd = Math.ceil((scrollTop + viewportHeight) / itemHeight);
    const endIndex = Math.min(totalCount, rawEnd + overscan);
    const visibleCount = Math.max(0, endIndex - startIndex);
    const offsetY = startIndex * itemHeight;

    return {
      startIndex,
      endIndex,
      visibleCount,
      totalHeight,
      offsetY
    };
  }

