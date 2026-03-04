"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

class Surface {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  index(x, y) {
    return (y * this.width + x) * 4;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getPixel(x, y) {
    if (!this.inBounds(x, y)) {
      return [0, 0, 0, 0];
    }
    const i = this.index(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  alphaAt(x, y) {
    if (!this.inBounds(x, y)) {
      return 0;
    }
    return this.data[this.index(x, y) + 3];
  }

  setPixel(x, y, color) {
    if (!this.inBounds(x, y)) {
      return;
    }
    const i = this.index(x, y);
    this.data[i] = color[0];
    this.data[i + 1] = color[1];
    this.data[i + 2] = color[2];
    this.data[i + 3] = color[3];
  }

  blendPixel(x, y, color) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (!this.inBounds(ix, iy)) {
      return;
    }
    const i = this.index(ix, iy);
    const srcA = color[3] / 255;
    const dstA = this.data[i + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) {
      return;
    }

    const outR = (color[0] * srcA + this.data[i] * dstA * (1 - srcA)) / outA;
    const outG = (color[1] * srcA + this.data[i + 1] * dstA * (1 - srcA)) / outA;
    const outB = (color[2] * srcA + this.data[i + 2] * dstA * (1 - srcA)) / outA;

    this.data[i] = clamp255(Math.round(outR));
    this.data[i + 1] = clamp255(Math.round(outG));
    this.data[i + 2] = clamp255(Math.round(outB));
    this.data[i + 3] = clamp255(Math.round(outA * 255));
  }

  fadePixel(x, y, amount) {
    if (!this.inBounds(x, y)) {
      return;
    }
    const i = this.index(x, y) + 3;
    this.data[i] = clamp255(Math.round(this.data[i] * (1 - amount)));
  }

  brush(x, y, radius, color, hardness = 0.65) {
    const r = Math.max(0.6, radius);
    const minX = Math.floor(x - r - 1);
    const maxX = Math.ceil(x + r + 1);
    const minY = Math.floor(y - r - 1);
    const maxY = Math.ceil(y + r + 1);

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const dx = px - x;
        const dy = py - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) {
          continue;
        }
        const falloff = Math.max(0, 1 - dist / (r + 0.0001));
        const alpha = Math.pow(falloff, hardness) * color[3];
        if (alpha <= 0.5) {
          continue;
        }
        this.blendPixel(px, py, [color[0], color[1], color[2], clamp255(Math.round(alpha))]);
      }
    }
  }

  composite(other) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const i = this.index(x, y);
        const a = other.data[i + 3];
        if (a === 0) {
          continue;
        }
        this.blendPixel(x, y, [other.data[i], other.data[i + 1], other.data[i + 2], a]);
      }
    }
  }

  writePng(filePath) {
    fs.writeFileSync(filePath, encodePng(this.width, this.height, this.data));
  }
}

function clamp255(value) {
  return Math.max(0, Math.min(255, value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRange(rng, min, max) {
  return min + rng() * (max - min);
}

function randomInt(rng, min, max) {
  return Math.floor(randomRange(rng, min, max + 1));
}

function quadPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
  };
}

function drawCurveStroke(surface, p0, p1, p2, widthStart, widthEnd, color, rng, steps = 96, jitter = 0.7) {
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = quadPoint(p0, p1, p2, t);
    const wobbleX = (rng() - 0.5) * jitter;
    const wobbleY = (rng() - 0.5) * jitter;
    const widthJitter = (rng() - 0.5) * 0.45;
    const width = Math.max(0.9, widthStart + (widthEnd - widthStart) * t + widthJitter);
    surface.brush(p.x + wobbleX, p.y + wobbleY, width, color, 0.7);
  }
}

function paintClump(surface, rng, cx, cy, radius, color) {
  const lobeCount = randomInt(rng, 4, 8);
  for (let l = 0; l < lobeCount; l += 1) {
    const angle = randomRange(rng, 0, Math.PI * 2);
    const dist = randomRange(rng, 0, radius * 0.4);
    const lx = cx + Math.cos(angle) * dist;
    const ly = cy + Math.sin(angle) * dist;
    const lr = radius * randomRange(rng, 0.4, 0.85);
    const drops = Math.max(18, Math.round(lr * lr * 0.42));
    for (let i = 0; i < drops; i += 1) {
      const a = randomRange(rng, 0, Math.PI * 2);
      const d = Math.sqrt(rng()) * lr;
      const x = lx + Math.cos(a) * d;
      const y = ly + Math.sin(a) * d;
      const pr = randomRange(rng, 0.7, Math.max(1.2, lr * 0.22));
      surface.brush(x, y, pr, color, 0.72);
    }
  }
}

function isEdgePixel(surface, x, y) {
  if (surface.alphaAt(x, y) === 0) {
    return false;
  }
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) {
        continue;
      }
      if (surface.alphaAt(x + ox, y + oy) === 0) {
        return true;
      }
    }
  }
  return false;
}

function breakEdges(surface, rng, amount) {
  const targets = [];
  for (let y = 1; y < surface.height - 1; y += 1) {
    for (let x = 1; x < surface.width - 1; x += 1) {
      if (isEdgePixel(surface, x, y) && rng() < amount) {
        targets.push({ x, y });
      }
    }
  }
  for (const target of targets) {
    surface.fadePixel(target.x, target.y, randomRange(rng, 0.55, 1));
    if (rng() > 0.65) {
      surface.fadePixel(target.x + randomInt(rng, -1, 1), target.y + randomInt(rng, -1, 1), randomRange(rng, 0.35, 0.95));
    }
  }
}

function addCanopyHoles(surface, rng, holes, cx, cy, rx, ry) {
  for (let i = 0; i < holes; i += 1) {
    const angle = randomRange(rng, 0, Math.PI * 2);
    const dist = Math.sqrt(rng());
    const hx = cx + Math.cos(angle) * rx * dist * randomRange(rng, 0.25, 0.85);
    const hy = cy + Math.sin(angle) * ry * dist * randomRange(rng, 0.25, 0.95);
    const r = randomRange(rng, 4, 11);
    const minX = Math.floor(hx - r - 1);
    const maxX = Math.ceil(hx + r + 1);
    const minY = Math.floor(hy - r - 1);
    const maxY = Math.ceil(hy + r + 1);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - hx;
        const dy = y - hy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) {
          continue;
        }
        const cut = 0.4 + (1 - d / r) * 0.6;
        surface.fadePixel(x, y, cut);
      }
    }
  }
}

function applyFoliageShading(surface, palette, moonX, moonY, rng) {
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      const a = surface.alphaAt(x, y);
      if (a === 0) {
        continue;
      }

      const lightDx = (moonX - x) / surface.width;
      const lightDy = (moonY - y) / surface.height;
      const light = clamp(0.52 + lightDx * 0.75 + lightDy * 1.18 + (rng() - 0.5) * 0.12, -0.2, 1.2);
      let shade = 2;

      if (light > 0.78) {
        shade = 0;
      } else if (light > 0.56) {
        shade = 1;
      } else if (light > 0.32) {
        shade = 2;
      } else if (light > 0.12) {
        shade = 3;
      } else {
        shade = 4;
      }

      const color = palette[clamp(shade, 0, palette.length - 1)];
      surface.setPixel(x, y, [color[0], color[1], color[2], a]);
    }
  }
}

function addShadowPockets(surface, rng, count, color, yMinFactor, yMaxFactor) {
  const yMin = surface.height * yMinFactor;
  const yMax = surface.height * yMaxFactor;
  for (let i = 0; i < count; i += 1) {
    const x = randomRange(rng, surface.width * 0.22, surface.width * 0.78);
    const y = randomRange(rng, yMin, yMax);
    paintClump(surface, rng, x, y, randomRange(rng, 7, 16), color);
  }
}

function addEdgeHighlights(surface, rng, highlightColor, moonX, moonY) {
  for (let y = 1; y < surface.height - 1; y += 1) {
    for (let x = 1; x < surface.width - 1; x += 1) {
      const a = surface.alphaAt(x, y);
      if (a === 0 || !isEdgePixel(surface, x, y)) {
        continue;
      }
      const towardMoon = (moonX - x) * 0.65 + (moonY - y) * 1.1;
      if (towardMoon > 0 && rng() > 0.42) {
        surface.blendPixel(x, y, [highlightColor[0], highlightColor[1], highlightColor[2], randomInt(rng, 38, 74)]);
      }
    }
  }
}

function drawPine(surface, seed) {
  const rng = mulberry32(hashSeed(seed));
  const cx = surface.width * 0.5 + randomRange(rng, -10, 10);
  const trunkBaseY = surface.height - 8;

  const barkDeep = [8, 20, 32, 255];
  const barkMid = [20, 52, 68, 220];
  const barkLite = [66, 122, 146, 165];
  const foliagePalette = [
    [94, 166, 190],
    [52, 126, 154],
    [28, 88, 118],
    [15, 58, 83],
    [7, 32, 54]
  ];

  drawCurveStroke(
    surface,
    { x: cx - 10, y: trunkBaseY },
    { x: cx + randomRange(rng, -22, 20), y: surface.height * 0.63 },
    { x: cx + randomRange(rng, -12, 11), y: 84 + randomRange(rng, -8, 10) },
    13,
    2.5,
    barkDeep,
    rng
  );
  drawCurveStroke(
    surface,
    { x: cx - 4, y: trunkBaseY - 4 },
    { x: cx + randomRange(rng, -16, 14), y: surface.height * 0.61 },
    { x: cx + randomRange(rng, -9, 8), y: 90 + randomRange(rng, -8, 10) },
    6,
    1.4,
    barkMid,
    rng
  );

  const branchRows = randomInt(rng, 11, 15);
  for (let row = 0; row < branchRows; row += 1) {
    const y = 104 + row * randomRange(rng, 13, 18);
    const span = randomRange(rng, 28, 72) * (0.42 + row / branchRows);
    const rise = randomRange(rng, 14, 28);
    const start = { x: cx + randomRange(rng, -5, 5), y };
    if (rng() > 0.12) {
      drawCurveStroke(
        surface,
        start,
        { x: start.x - span * 0.52 + randomRange(rng, -5, 4), y: y - rise * 0.78 + randomRange(rng, -3, 3) },
        { x: start.x - span + randomRange(rng, -7, 4), y: y - rise + randomRange(rng, -4, 5) },
        randomRange(rng, 3.4, 5.2),
        randomRange(rng, 0.8, 1.3),
        barkDeep,
        rng
      );
    }
    if (rng() > 0.18) {
      drawCurveStroke(
        surface,
        start,
        { x: start.x + span * 0.56 + randomRange(rng, -4, 6), y: y - rise * 0.72 + randomRange(rng, -3, 3) },
        { x: start.x + span + randomRange(rng, -4, 7), y: y - rise + randomRange(rng, -5, 5) },
        randomRange(rng, 3.2, 5),
        randomRange(rng, 0.8, 1.3),
        barkDeep,
        rng
      );
    }
  }

  const foliage = new Surface(surface.width, surface.height);
  const clumpCount = randomInt(rng, 24, 40);
  for (let i = 0; i < clumpCount; i += 1) {
    const t = Math.pow(randomRange(rng, 0, 1), 0.88);
    const y = 30 + t * (surface.height - 74);
    const coneHalf = 18 + t * 88;
    const drift = randomRange(rng, -1, 1);
    const x = cx + drift * coneHalf * (0.5 + (1 - Math.abs(drift)) * 0.5);
    const r = randomRange(rng, 8, 20) * (0.62 + t * 0.75);
    paintClump(foliage, rng, x, y, r, [48, 118, 145, randomInt(rng, 194, 242)]);
  }

  for (let s = 0; s < 4; s += 1) {
    paintClump(foliage, rng, cx + randomRange(rng, -7, 7), 24 + s * 10, randomRange(rng, 5, 9), [58, 130, 154, 220]);
  }

  breakEdges(foliage, rng, 0.22);
  applyFoliageShading(foliage, foliagePalette, surface.width * 0.2, surface.height * 0.12, rng);
  addShadowPockets(foliage, rng, 9, [6, 28, 46, 108], 0.44, 0.82);
  addEdgeHighlights(foliage, rng, [116, 188, 206], surface.width * 0.16, surface.height * 0.08);
  surface.composite(foliage);

  for (let i = 0; i < 180; i += 1) {
    const y = randomRange(rng, 92, trunkBaseY);
    const x = cx + randomRange(rng, -7, 8) + (y - 120) * 0.02 * (rng() > 0.5 ? 1 : -1);
    surface.blendPixel(x, y, [barkLite[0], barkLite[1], barkLite[2], randomInt(rng, 20, 52)]);
  }
}

function drawOak(surface, seed) {
  const rng = mulberry32(hashSeed(seed));
  const cx = surface.width * 0.5 + randomRange(rng, -14, 14);
  const trunkBaseY = surface.height - 6;
  const canopyCy = surface.height * 0.36;

  const barkDeep = [7, 18, 30, 255];
  const barkMid = [20, 48, 66, 230];
  const barkLite = [74, 128, 152, 170];
  const foliagePalette = [
    [104, 174, 196],
    [58, 132, 158],
    [32, 96, 124],
    [16, 63, 88],
    [8, 36, 58]
  ];

  drawCurveStroke(
    surface,
    { x: cx - 18, y: trunkBaseY },
    { x: cx + randomRange(rng, -22, 28), y: surface.height * 0.72 },
    { x: cx + randomRange(rng, -20, 16), y: surface.height * 0.44 },
    19,
    6,
    barkDeep,
    rng
  );
  drawCurveStroke(
    surface,
    { x: cx - 8, y: trunkBaseY - 4 },
    { x: cx + randomRange(rng, -18, 18), y: surface.height * 0.7 },
    { x: cx + randomRange(rng, -14, 11), y: surface.height * 0.48 },
    9,
    2.6,
    barkMid,
    rng
  );

  const mainForks = randomInt(rng, 3, 5);
  for (let i = 0; i < mainForks; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const startY = surface.height * randomRange(rng, 0.48, 0.66);
    const len = randomRange(rng, 66, 122);
    const rise = randomRange(rng, 44, 86);
    const start = { x: cx + randomRange(rng, -7, 7), y: startY };
    drawCurveStroke(
      surface,
      start,
      {
        x: start.x + side * len * randomRange(rng, 0.42, 0.62) + randomRange(rng, -8, 8),
        y: startY - rise * randomRange(rng, 0.5, 0.75)
      },
      {
        x: start.x + side * len + randomRange(rng, -10, 10),
        y: startY - rise + randomRange(rng, -10, 8)
      },
      randomRange(rng, 6.5, 9),
      randomRange(rng, 1.2, 2.2),
      barkDeep,
      rng
    );
  }

  const canopy = new Surface(surface.width, surface.height);
  const clumpCount = randomInt(rng, 44, 66);
  for (let i = 0; i < clumpCount; i += 1) {
    const angle = randomRange(rng, 0, Math.PI * 2);
    const dist = Math.sqrt(rng());
    const rx = randomRange(rng, 90, 132);
    const ry = randomRange(rng, 62, 96);
    const x = cx + Math.cos(angle) * rx * dist + randomRange(rng, -16, 16);
    const y = canopyCy + Math.sin(angle) * ry * dist + randomRange(rng, -12, 12);
    const r = randomRange(rng, 10, 24);
    paintClump(canopy, rng, x, y, r, [52, 122, 148, randomInt(rng, 192, 238)]);
  }

  for (let fringe = 0; fringe < 14; fringe += 1) {
    const angle = randomRange(rng, -Math.PI * 0.95, Math.PI * 0.15);
    const rx = randomRange(rng, 108, 140);
    const ry = randomRange(rng, 66, 100);
    const x = cx + Math.cos(angle) * rx;
    const y = canopyCy + Math.sin(angle) * ry;
    paintClump(canopy, rng, x, y, randomRange(rng, 8, 16), [42, 102, 130, randomInt(rng, 170, 220)]);
  }

  addCanopyHoles(canopy, rng, randomInt(rng, 7, 12), cx, canopyCy, 78, 56);
  breakEdges(canopy, rng, 0.18);
  applyFoliageShading(canopy, foliagePalette, surface.width * 0.16, surface.height * 0.1, rng);
  addShadowPockets(canopy, rng, 12, [6, 26, 44, 112], 0.34, 0.64);
  addEdgeHighlights(canopy, rng, [122, 196, 214], surface.width * 0.14, surface.height * 0.08);
  surface.composite(canopy);

  for (let i = 0; i < 280; i += 1) {
    const y = randomRange(rng, surface.height * 0.43, trunkBaseY);
    const spread = (y - surface.height * 0.42) * 0.07;
    const x = cx + randomRange(rng, -spread, spread);
    surface.blendPixel(x, y, [barkLite[0], barkLite[1], barkLite[2], randomInt(rng, 20, 52)]);
  }
}

function softenSilhouetteEdges(surface, color, alpha) {
  for (let y = 1; y < surface.height - 1; y += 1) {
    for (let x = 1; x < surface.width - 1; x += 1) {
      if (!isEdgePixel(surface, x, y)) {
        continue;
      }
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (surface.alphaAt(x + ox, y + oy) > 0) {
            continue;
          }
          surface.blendPixel(x + ox, y + oy, [color[0], color[1], color[2], alpha]);
        }
      }
    }
  }
}

function drawSilhouettePine(surface, seed) {
  const rng = mulberry32(hashSeed(seed));
  const cx = surface.width * 0.5 + randomRange(rng, -10, 10);
  const dark = [8, 22, 38, 172];
  const soft = [14, 36, 58, 122];

  drawCurveStroke(
    surface,
    { x: cx - 6, y: surface.height - 5 },
    { x: cx + randomRange(rng, -10, 9), y: surface.height * 0.68 },
    { x: cx + randomRange(rng, -6, 6), y: surface.height * 0.22 },
    10,
    1.8,
    dark,
    rng
  );

  const canopy = new Surface(surface.width, surface.height);
  const clumps = randomInt(rng, 22, 30);
  for (let i = 0; i < clumps; i += 1) {
    const t = Math.pow(randomRange(rng, 0, 1), 0.86);
    const y = 18 + t * (surface.height * 0.72);
    const halfWidth = 10 + t * 72;
    const drift = randomRange(rng, -1, 1);
    const x = cx + drift * halfWidth * (0.45 + (1 - Math.abs(drift)) * 0.55);
    const radius = randomRange(rng, 7, 14) * (0.6 + t * 0.62);
    paintClump(canopy, rng, x, y, radius, [dark[0], dark[1], dark[2], randomInt(rng, 132, 172)]);
    if (rng() > 0.56) {
      paintClump(canopy, rng, x + randomRange(rng, -6, 6), y + randomRange(rng, -3, 3), radius * 0.58, [soft[0], soft[1], soft[2], randomInt(rng, 86, 126)]);
    }
  }
  for (let tip = 0; tip < 4; tip += 1) {
    paintClump(canopy, rng, cx + randomRange(rng, -4, 4), 14 + tip * 6, randomRange(rng, 4, 7), [soft[0], soft[1], soft[2], 118]);
  }
  breakEdges(canopy, rng, 0.15);
  addCanopyHoles(canopy, rng, randomInt(rng, 3, 5), cx, surface.height * 0.5, 40, 56);
  softenSilhouetteEdges(canopy, soft, 54);
  surface.composite(canopy);
}

function drawSilhouetteOak(surface, seed) {
  const rng = mulberry32(hashSeed(seed));
  const cx = surface.width * 0.5 + randomRange(rng, -12, 12);
  const dark = [9, 24, 40, 168];
  const soft = [17, 43, 64, 120];

  drawCurveStroke(
    surface,
    { x: cx - 9, y: surface.height - 6 },
    { x: cx + randomRange(rng, -15, 14), y: surface.height * 0.72 },
    { x: cx + randomRange(rng, -11, 10), y: surface.height * 0.42 },
    12,
    2.4,
    dark,
    rng
  );

  const canopy = new Surface(surface.width, surface.height);
  const clumps = randomInt(rng, 26, 34);
  const cy = surface.height * 0.4;
  for (let i = 0; i < clumps; i += 1) {
    const angle = randomRange(rng, 0, Math.PI * 2);
    const dist = Math.sqrt(rng());
    const rx = randomRange(rng, 64, 90);
    const ry = randomRange(rng, 42, 64);
    const x = cx + Math.cos(angle) * rx * dist + randomRange(rng, -8, 8);
    const y = cy + Math.sin(angle) * ry * dist + randomRange(rng, -7, 7);
    const r = randomRange(rng, 9, 17);
    paintClump(canopy, rng, x, y, r, [dark[0], dark[1], dark[2], randomInt(rng, 128, 166)]);
    if (rng() > 0.54) {
      paintClump(canopy, rng, x + randomRange(rng, -4, 4), y + randomRange(rng, -3, 3), r * 0.5, [soft[0], soft[1], soft[2], randomInt(rng, 82, 118)]);
    }
  }

  addCanopyHoles(canopy, rng, randomInt(rng, 5, 8), cx, cy, 52, 38);
  breakEdges(canopy, rng, 0.16);
  softenSilhouetteEdges(canopy, soft, 50);
  surface.composite(canopy);
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const chunk = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(chunk), 0);
  return Buffer.concat([length, chunk, crc]);
}

function encodePng(width, height, rgbaData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    const srcStart = y * stride;
    raw.set(rgbaData.slice(srcStart, srcStart + stride), rowStart + 1);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array())]);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function outputTreeAtlas() {
  const root = path.resolve(process.cwd(), "public/pixel/trees");
  const pineDir = path.join(root, "pine");
  const oakDir = path.join(root, "oak");
  const silhouetteDir = path.join(root, "silhouette");

  ensureDir(pineDir);
  ensureDir(oakDir);
  ensureDir(silhouetteDir);

  const pineA = new Surface(256, 384);
  drawPine(pineA, "pine-a-v3");
  pineA.writePng(path.join(pineDir, "pine_a.png"));

  const pineB = new Surface(256, 384);
  drawPine(pineB, "pine-b-v3");
  pineB.writePng(path.join(pineDir, "pine_b.png"));

  const oakA = new Surface(320, 320);
  drawOak(oakA, "oak-a-v3");
  oakA.writePng(path.join(oakDir, "oak_a.png"));

  const oakB = new Surface(320, 320);
  drawOak(oakB, "oak-b-v3");
  oakB.writePng(path.join(oakDir, "oak_b.png"));

  const silPineA = new Surface(220, 260);
  drawSilhouettePine(silPineA, "sil-pine-a-v5");
  silPineA.writePng(path.join(silhouetteDir, "sil_pine_a.png"));

  const silPineB = new Surface(220, 260);
  drawSilhouettePine(silPineB, "sil-pine-b-v5");
  silPineB.writePng(path.join(silhouetteDir, "sil_pine_b.png"));

  const silOakA = new Surface(220, 260);
  drawSilhouetteOak(silOakA, "sil-oak-a-v5");
  silOakA.writePng(path.join(silhouetteDir, "sil_oak_a.png"));

  const silOakB = new Surface(220, 260);
  drawSilhouetteOak(silOakB, "sil-oak-b-v5");
  silOakB.writePng(path.join(silhouetteDir, "sil_oak_b.png"));

  // Legacy silhouette outputs retained for debug endpoint compatibility.
  const silA = new Surface(220, 260);
  drawSilhouettePine(silA, "sil-a-legacy");
  silA.writePng(path.join(silhouetteDir, "sil_a.png"));

  const silB = new Surface(220, 260);
  drawSilhouetteOak(silB, "sil-b-legacy");
  silB.writePng(path.join(silhouetteDir, "sil_b.png"));
}

outputTreeAtlas();
console.log("Generated placeholder tree atlas PNGs (silhouettes + standard trees).");
