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

  idx(x, y) {
    return (y * this.width + x) * 4;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  alphaAt(x, y) {
    if (!this.inBounds(x, y)) {
      return 0;
    }
    return this.data[this.idx(x, y) + 3];
  }

  set(x, y, c) {
    if (!this.inBounds(x, y)) {
      return;
    }
    const i = this.idx(x, y);
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  blend(x, y, c) {
    if (!this.inBounds(x, y)) {
      return;
    }
    const i = this.idx(x, y);
    const sa = c[3] / 255;
    const da = this.data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) {
      return;
    }
    this.data[i] = Math.round((c[0] * sa + this.data[i] * da * (1 - sa)) / oa);
    this.data[i + 1] = Math.round((c[1] * sa + this.data[i + 1] * da * (1 - sa)) / oa);
    this.data[i + 2] = Math.round((c[2] * sa + this.data[i + 2] * da * (1 - sa)) / oa);
    this.data[i + 3] = Math.round(oa * 255);
  }

  circle(cx, cy, r, c) {
    const minX = Math.floor(cx - r);
    const maxX = Math.ceil(cx + r);
    const minY = Math.floor(cy - r);
    const maxY = Math.ceil(cy + r);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) {
          this.blend(x, y, c);
        }
      }
    }
  }

  clearCircle(cx, cy, r) {
    const minX = Math.floor(cx - r);
    const maxX = Math.ceil(cx + r);
    const minY = Math.floor(cy - r);
    const maxY = Math.ceil(cy + r);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r && this.inBounds(x, y)) {
          this.data[this.idx(x, y) + 3] = 0;
        }
      }
    }
  }
}

function quadPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
  };
}

function strokeQuad(surface, p0, p1, p2, w0, w1, c) {
  const steps = 180;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = quadPoint(p0, p1, p2, t);
    const w = w0 + (w1 - w0) * t;
    surface.circle(p.x, p.y, Math.max(0.6, w), c);
  }
}

function clump(surface, cx, cy, r, c) {
  const lobes = [
    [0, 0, 1],
    [-0.6, -0.2, 0.72],
    [0.66, -0.22, 0.7],
    [-0.24, 0.58, 0.62],
    [0.46, 0.5, 0.55]
  ];
  for (const [ox, oy, s] of lobes) {
    surface.circle(cx + ox * r, cy + oy * r, r * s, c);
  }
}

function isEdge(s, x, y) {
  if (s.alphaAt(x, y) === 0) {
    return false;
  }
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) {
        continue;
      }
      if (s.alphaAt(x + ox, y + oy) === 0) {
        return true;
      }
    }
  }
  return false;
}

function breakSilhouette(s) {
  for (let y = 1; y < s.height - 1; y += 1) {
    for (let x = 1; x < s.width - 1; x += 1) {
      if (!isEdge(s, x, y)) {
        continue;
      }
      const mark = (x * 23 + y * 41) % 29;
      if (mark === 0 || mark === 7) {
        s.data[s.idx(x, y) + 3] = 0;
      }
    }
  }
}

function rimLight(s, color, lx, ly) {
  for (let y = 1; y < s.height - 1; y += 1) {
    for (let x = 1; x < s.width - 1; x += 1) {
      if (!isEdge(s, x, y)) {
        continue;
      }
      const toward = (lx - x) * 0.6 + (ly - y);
      if (toward > 0) {
        s.blend(x, y, color);
      }
    }
  }
}

function shadeFromLight(x, y, lx, ly) {
  const dx = (lx - x) / 160;
  const dy = (ly - y) / 180;
  const v = 0.5 + dx * 0.8 + dy * 1.1;
  if (v > 0.9) return 0;
  if (v > 0.72) return 1;
  if (v > 0.52) return 2;
  if (v > 0.32) return 3;
  return 4;
}

function repaintByLight(s, palette, lx, ly) {
  for (let y = 0; y < s.height; y += 1) {
    for (let x = 0; x < s.width; x += 1) {
      const a = s.alphaAt(x, y);
      if (a === 0) {
        continue;
      }
      const idx = shadeFromLight(x, y, lx, ly);
      const c = palette[idx];
      s.set(x, y, [c[0], c[1], c[2], a]);
    }
  }
}

function upscaleNearest(src, factor) {
  const out = new Surface(src.width * factor, src.height * factor);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const i = src.idx(x, y);
      const c = [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
      if (c[3] === 0) {
        continue;
      }
      for (let oy = 0; oy < factor; oy += 1) {
        for (let ox = 0; ox < factor; ox += 1) {
          out.set(x * factor + ox, y * factor + oy, c);
        }
      }
    }
  }
  return out;
}

function drawHandcraftedPine() {
  const s = new Surface(128, 192);
  const trunk = [9, 24, 39, 255];
  const barkLite = [63, 120, 148, 156];
  const foliage = [64, 132, 162, 238];
  const canopy = new Surface(128, 192);

  strokeQuad(s, { x: 60, y: 186 }, { x: 56, y: 108 }, { x: 62, y: 30 }, 6, 1.6, trunk);
  strokeQuad(s, { x: 64, y: 186 }, { x: 62, y: 114 }, { x: 66, y: 34 }, 5, 1.2, trunk);

  const branchDefs = [
    [52, 170, 26, 12], [53, 160, 28, 13], [54, 150, 31, 14], [56, 140, 34, 15], [58, 130, 37, 17],
    [59, 120, 40, 18], [60, 110, 43, 20], [61, 100, 45, 21], [62, 90, 48, 23], [63, 80, 50, 24], [64, 70, 52, 25]
  ];
  for (const [x, y, span, rise] of branchDefs) {
    strokeQuad(s, { x, y }, { x: x - span * 0.55, y: y - rise * 0.7 }, { x: x - span, y: y - rise }, 2.3, 0.8, trunk);
    strokeQuad(s, { x, y }, { x: x + span * 0.58, y: y - rise * 0.66 }, { x: x + span, y: y - rise }, 2.2, 0.8, trunk);
  }

  const tierY = [24, 34, 46, 59, 73, 88, 104, 121, 139, 158];
  const tierHalf = [6, 8, 11, 15, 19, 23, 27, 31, 35, 38];
  for (let i = 0; i < tierY.length; i += 1) {
    const y = tierY[i];
    const half = tierHalf[i];
    const xStep = Math.max(7, Math.round(half / 1.7));
    for (let x = 64 - half; x <= 64 + half; x += xStep) {
      const r = Math.max(3, Math.round(half * 0.18 + 2));
      clump(canopy, x, y, r, foliage);
    }
  }

  const pineHoles = [
    [58, 70, 4],
    [70, 82, 5],
    [54, 98, 4],
    [72, 116, 5],
    [60, 134, 4]
  ];
  for (const [x, y, r] of pineHoles) {
    canopy.clearCircle(x, y, r);
  }

  breakSilhouette(canopy);
  repaintByLight(
    canopy,
    [
      [124, 200, 218],
      [90, 168, 194],
      [58, 132, 162],
      [32, 94, 124],
      [14, 56, 84]
    ],
    24,
    8
  );
  rimLight(canopy, [152, 226, 238, 86], 20, 4);

  // composite canopy
  for (let y = 0; y < canopy.height; y += 1) {
    for (let x = 0; x < canopy.width; x += 1) {
      const i = canopy.idx(x, y);
      if (canopy.data[i + 3] === 0) {
        continue;
      }
      s.blend(x, y, [canopy.data[i], canopy.data[i + 1], canopy.data[i + 2], canopy.data[i + 3]]);
    }
  }

  for (let y = 38; y < 188; y += 2) {
    const x = 62 + (((y * 7) % 5) - 2);
    s.blend(x, y, barkLite);
  }

  return upscaleNearest(s, 4); // 512x768
}

function drawHandcraftedOak() {
  const s = new Surface(160, 160);
  const trunk = [9, 22, 36, 255];
  const barkLite = [74, 134, 162, 160];
  const canopy = new Surface(160, 160);

  strokeQuad(s, { x: 74, y: 156 }, { x: 70, y: 118 }, { x: 74, y: 74 }, 9, 3.8, trunk);
  strokeQuad(s, { x: 82, y: 156 }, { x: 80, y: 120 }, { x: 84, y: 76 }, 8, 3.2, trunk);

  const forks = [
    [76, 106, -40, -34], [82, 104, 42, -34], [79, 96, -52, -44], [86, 95, 56, -42], [80, 88, -32, -52], [86, 90, 34, -50]
  ];
  for (const [sx, sy, dx, dy] of forks) {
    strokeQuad(
      s,
      { x: sx, y: sy },
      { x: sx + dx * 0.54, y: sy + dy * 0.62 },
      { x: sx + dx, y: sy + dy },
      3.2,
      1.2,
      trunk
    );
  }

  const clumps = [
    [44, 56, 18], [60, 46, 20], [78, 42, 22], [98, 46, 20], [116, 56, 18],
    [34, 70, 16], [52, 68, 18], [70, 66, 20], [90, 66, 20], [108, 68, 18], [126, 72, 16],
    [40, 84, 14], [58, 82, 17], [78, 80, 18], [98, 80, 18], [118, 84, 16]
  ];
  for (const [x, y, r] of clumps) {
    clump(canopy, x, y, r, [66, 138, 170, 236]);
  }

  const holes = [
    [64, 62, 6], [94, 58, 7], [82, 74, 6], [52, 78, 5], [108, 78, 5]
  ];
  for (const [x, y, r] of holes) {
    canopy.clearCircle(x, y, r);
  }

  breakSilhouette(canopy);
  repaintByLight(
    canopy,
    [
      [132, 206, 224],
      [96, 176, 200],
      [62, 138, 168],
      [34, 98, 128],
      [14, 60, 90]
    ],
    20,
    8
  );
  rimLight(canopy, [158, 230, 240, 88], 18, 6);

  for (let y = 0; y < canopy.height; y += 1) {
    for (let x = 0; x < canopy.width; x += 1) {
      const i = canopy.idx(x, y);
      if (canopy.data[i + 3] === 0) {
        continue;
      }
      s.blend(x, y, [canopy.data[i], canopy.data[i + 1], canopy.data[i + 2], canopy.data[i + 3]]);
    }
  }

  for (let y = 76; y < 158; y += 2) {
    const spread = Math.max(2, Math.floor((y - 76) * 0.08));
    const x = 78 + (((y * 5) % (spread * 2 + 1)) - spread);
    s.blend(x, y, barkLite);
  }

  return upscaleNearest(s, 4); // 640x640
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

function writePng(surface, filePath) {
  fs.writeFileSync(filePath, encodePng(surface.width, surface.height, surface.data));
}

function main() {
  const outDir = path.join(process.cwd(), "public/pixel/trees/hero");
  fs.mkdirSync(outDir, { recursive: true });

  const pine = drawHandcraftedPine();
  const oak = drawHandcraftedOak();

  writePng(pine, path.join(outDir, "hero_pine_a.png"));
  writePng(oak, path.join(outDir, "hero_oak_a.png"));
  console.log("Wrote handcrafted hero sprites.");
}

main();
