// Builds a CSS gradient used as a banner placeholder when a company has no
// og:image. Prefers the enriched brand color and falls back to a deterministic
// hue derived from the company name so each company keeps a stable identity.

type Hsl = { h: number; s: number; l: number };

function hashHue(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

function hexToHsl(hex: string): Hsl | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l: l * 100 };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = Math.round(h * 60);
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function brandGradient(seed: string, brandColor?: string): string {
  const base = brandColor ? hexToHsl(brandColor) : null;
  const h = base ? base.h : hashHue(seed);
  const s = base ? clamp(base.s, 45, 75) : 60;
  const l = base ? clamp(base.l, 35, 55) : 45;
  const from = `hsl(${h} ${s}% ${l}%)`;
  const to = `hsl(${(h + 28) % 360} ${clamp(s + 8, 0, 85)}% ${clamp(l - 16, 18, 100)}%)`;
  return `linear-gradient(135deg, ${from}, ${to})`;
}
