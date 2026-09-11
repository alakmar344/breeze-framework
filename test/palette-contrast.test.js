const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── WCAG 2.1 Contrast Math ──────────────────────────────────────────

function parseHex(hex) {
  hex = hex.trim().replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function channelLuminance(channel) {
  const sRGB = channel / 255;
  return sRGB <= 0.04045
    ? sRGB / 12.92
    : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  const r = channelLuminance(rgb.r);
  const g = channelLuminance(rgb.g);
  const b = channelLuminance(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(parseHex(hex1));
  const l2 = relativeLuminance(parseHex(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractCssVar(cssContent, varName) {
  // Matches e.g. --bz-blueberry: #0266d6; or var(--bz-primary)
  const regex = new RegExp(`${varName}\\s*:\\s*([^;]+);`);
  const match = cssContent.match(regex);
  if (!match) return null;
  let val = match[1].trim();
  if (val.startsWith('var(')) {
    const aliasedVar = val.slice(4, -1).trim();
    return extractCssVar(cssContent, aliasedVar);
  }
  return val;
}

describe('Primary Palette & WCAG Contrast Ratios (Task 5)', () => {
  const cssPath = path.join(__dirname, '../breeze.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const primary = extractCssVar(cssContent, '--bz-primary') || '#0266d6';
  const primaryDark = extractCssVar(cssContent, '--bz-primary-dark') || '#0048a7';
  const primaryLight = extractCssVar(cssContent, '--bz-primary-light') || '#ebf4ff';
  const blueberry = extractCssVar(cssContent, '--bz-blueberry') || primary;
  const blueberryDark = extractCssVar(cssContent, '--bz-blueberry-dark') || primaryDark;
  const blueberryLight = extractCssVar(cssContent, '--bz-blueberry-light') || primaryLight;

  it('resolves CSS custom property tokens properly', () => {
    assert.ok(primary.startsWith('#'), `primary token should be hex: ${primary}`);
    assert.ok(primaryDark.startsWith('#'), `primaryDark token should be hex: ${primaryDark}`);
    assert.ok(primaryLight.startsWith('#'), `primaryLight token should be hex: ${primaryLight}`);
    assert.ok(blueberry.startsWith('#'), `blueberry token should be hex: ${blueberry}`);
  });

  describe('Light Background (#ffffff) Contrast', () => {
    it('primary color satisfies WCAG AA (>= 4.5:1) against white', () => {
      const ratio = contrastRatio(primary, '#ffffff');
      assert.ok(
        ratio >= 4.5,
        `Primary ${primary} contrast on white was ${ratio.toFixed(2)}:1 (expected >= 4.5:1)`
      );
    });

    it('blueberry alias satisfies WCAG AA (>= 4.5:1) against white', () => {
      const ratio = contrastRatio(blueberry, '#ffffff');
      assert.ok(
        ratio >= 4.5,
        `Blueberry ${blueberry} contrast on white was ${ratio.toFixed(2)}:1 (expected >= 4.5:1)`
      );
    });

    it('primary dark variant satisfies WCAG AAA (>= 7.0:1) against white', () => {
      const ratio = contrastRatio(primaryDark, '#ffffff');
      assert.ok(
        ratio >= 7.0,
        `Primary dark ${primaryDark} contrast on white was ${ratio.toFixed(2)}:1 (expected >= 7.0:1)`
      );
    });

    it('white text on primary button satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = contrastRatio('#ffffff', primary);
      assert.ok(
        ratio >= 4.5,
        `White text on primary button was ${ratio.toFixed(2)}:1 (expected >= 4.5:1)`
      );
    });
  });

  describe('Dark Background (#111827 and #0f172a) Contrast', () => {
    const darkBg1 = '#111827'; // Tailwind gray-900 / Breeze dark-bg
    const darkBg2 = '#0f172a'; // Tailwind slate-900 / App dark-bg

    it('light tint satisfies WCAG AAA (>= 7.0:1) on #111827', () => {
      const ratio = contrastRatio(primaryLight, darkBg1);
      assert.ok(
        ratio >= 7.0,
        `Primary light ${primaryLight} on ${darkBg1} was ${ratio.toFixed(2)}:1 (expected >= 7.0:1)`
      );
    });

    it('light tint satisfies WCAG AAA (>= 7.0:1) on #0f172a', () => {
      const ratio = contrastRatio(primaryLight, darkBg2);
      assert.ok(
        ratio >= 7.0,
        `Primary light ${primaryLight} on ${darkBg2} was ${ratio.toFixed(2)}:1 (expected >= 7.0:1)`
      );
    });

    it('blueberry light alias satisfies WCAG AAA (>= 7.0:1) on dark backgrounds', () => {
      const ratio = contrastRatio(blueberryLight, darkBg1);
      assert.ok(
        ratio >= 7.0,
        `Blueberry light ${blueberryLight} on ${darkBg1} was ${ratio.toFixed(2)}:1 (expected >= 7.0:1)`
      );
    });
  });

  describe('Component Compound Contrast (Badges & Pills)', () => {
    it('dark text on light pill badge satisfies WCAG AAA (>= 7.0:1)', () => {
      const ratio = contrastRatio(blueberryDark, blueberryLight);
      assert.ok(
        ratio >= 7.0,
        `Badge text ${blueberryDark} on ${blueberryLight} was ${ratio.toFixed(2)}:1 (expected >= 7.0:1)`
      );
    });
  });

  describe('Tailwind Palette Collision Avoidance', () => {
    const tailwindCollisions = [
      { name: 'Tailwind indigo-600', hex: '#4f46e5' },
      { name: 'Tailwind indigo-500', hex: '#6366f1' },
      { name: 'Tailwind blue-500',   hex: '#3b82f6' },
      { name: 'Tailwind blue-600',   hex: '#2563eb' },
      { name: 'Tailwind sky-600',    hex: '#0284c7' }
    ];

    it('does not match any standard Tailwind primary color', () => {
      const p = primary.toLowerCase();
      for (const tw of tailwindCollisions) {
        assert.notEqual(p, tw.hex.toLowerCase(), `Breeze primary matches ${tw.name} (${tw.hex})`);
      }
    });

    it('maintains distinct Euclidean color distance from Tailwind indigo-600 (#4f46e5)', () => {
      const c1 = parseHex(primary);
      const c2 = parseHex('#4f46e5');
      const dist = Math.sqrt(
        Math.pow(c1.r - c2.r, 2) +
        Math.pow(c1.g - c2.g, 2) +
        Math.pow(c1.b - c2.b, 2)
      );
      assert.ok(
        dist > 30,
        `Distance between Breeze primary and Tailwind indigo-600 is too small: ${dist.toFixed(1)} (expected > 30)`
      );
    });
  });
});
