import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

type Color = [number, number, number, number];
type Point = { x: number; y: number };

class Surface {
  width: number;
  height: number;
  data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  blendPixel(x: number, y: number, color: Color) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) {
      return;
    }

    const index = (iy * this.width + ix) * 4;
    const srcA = color[3] / 255;
    const dstA = this.data[index + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);

    if (outA <= 0) {
      return;
    }

    const dstR = this.data[index];
    const dstG = this.data[index + 1];
    const dstB = this.data[index + 2];

    const outR = (color[0] * srcA + dstR * dstA * (1 - srcA)) / outA;
    const outG = (color[1] * srcA + dstG * dstA * (1 - srcA)) / outA;
    const outB = (color[2] * srcA + dstB * dstA * (1 - srcA)) / outA;

    this.data[index] = Math.max(0, Math.min(255, Math.round(outR)));
    this.data[index + 1] = Math.max(0, Math.min(255, Math.round(outG)));
    this.data[index + 2] = Math.max(0, Math.min(255, Math.round(outB)));
    this.data[index + 3] = Math.max(0, Math.min(255, Math.round(outA * 255)));
  }

  brush(x: number, y: number, radius: number, color: Color) {
    const r = Math.max(1, radius);
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
        const edge = 1 - dist / (r + 0.001);
        const a = Math.round(color[3] * (0.55 + edge * 0.45));
        this.blendPixel(px, py, [color[0], color[1], color[2], a]);
      }
    }
  }

  fillPolygon(points: Point[], color: Color) {
    if (points.length < 3) {
      return;
    }

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.height - 1, Math.ceil(maxY));

    for (let y = yStart; y <= yEnd; y += 1) {
      const intersections: number[] = [];
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        const yMin = Math.min(a.y, b.y);
        const yMax = Math.max(a.y, b.y);
        if (y < yMin || y >= yMax || a.y === b.y) {
          continue;
        }
        const t = (y - a.y) / (b.y - a.y);
        intersections.push(a.x + (b.x - a.x) * t);
      }

      intersections.sort((left, right) => left - right);
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const xStart = Math.max(0, Math.floor(intersections[i] ?? 0));
        const xEnd = Math.min(this.width - 1, Math.ceil(intersections[i + 1] ?? 0));
        for (let x = xStart; x <= xEnd; x += 1) {
          this.blendPixel(x, y, color);
        }
      }
    }
  }

  writePng(filePath: string) {
    fs.writeFileSync(filePath, encodePng(this.width, this.height, this.data));
  }
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRange(rng: () => number, min: number, max: number) {
  return min + rng() * (max - min);
}

function quadraticPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
  };
}

function strokeQuadratic(
  surface: Surface,
  p0: Point,
  p1: Point,
  p2: Point,
  widthStart: number,
  widthEnd: number,
  color: Color,
  rng: () => number
) {
  const steps = 88;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const point = quadraticPoint(p0, p1, p2, t);
    const wobble = (rng() - 0.5) * 1.6;
    const width = widthStart + (widthEnd - widthStart) * t + wobble * (1 - t * 0.6);
    surface.brush(point.x + (rng() - 0.5) * 0.9, point.y + (rng() - 0.5) * 0.9, Math.max(1, width), color);
  }
}

function jaggedConeTier(
  surface: Surface,
  rng: () => number,
  cx: number,
  topY: number,
  bottomY: number,
  halfWidth: number,
  color: Color
) {
  const points: Point[] = [];
  points.push({ x: cx + randomRange(rng, -2, 2), y: topY + randomRange(rng, -1.5, 1.5) });

  const leftSteps = 6;
  for (let i = 1; i <= leftSteps; i += 1) {
    const t = i / leftSteps;
    points.push({
      x: cx - halfWidth * t - randomRange(rng, 1, 5),
      y: topY + (bottomY - topY) * t + randomRange(rng, -2, 2)
    });
  }

  const rightSteps = 6;
  const rightPoints: Point[] = [];
  for (let i = 1; i <= rightSteps; i += 1) {
    const t = i / rightSteps;
    rightPoints.push({
      x: cx + halfWidth * (1 - t) + randomRange(rng, 1, 5),
      y: bottomY - (bottomY - topY) * t + randomRange(rng, -2, 2)
    });
  }

  points.push(
    { x: cx + halfWidth + randomRange(rng, 1, 4), y: bottomY + randomRange(rng, -1, 2) },
    ...rightPoints
  );
  surface.fillPolygon(points, color);
}

function irregularBlob(
  surface: Surface,
  rng: () => number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number,
  color: Color
) {
  const points: Point[] = [];
  const rotation = randomRange(rng, -0.45, 0.45);
  for (let index = 0; index < count; index += 1) {
    const t = index / count;
    const angle = t * Math.PI * 2 + rotation;
    const stretch = 0.72 + rng() * 0.42;
    const radiusX = rx * stretch * (0.88 + rng() * 0.24);
    const radiusY = ry * stretch * (0.82 + rng() * 0.3);
    points.push({
      x: cx + Math.cos(angle) * radiusX + randomRange(rng, -3, 3),
      y: cy + Math.sin(angle) * radiusY + randomRange(rng, -3, 3)
    });
  }
  surface.fillPolygon(points, color);
}

function drawPine(surface: Surface, seed: string) {
  const rng = mulberry32(hashSeed(seed));
  const trunkDark: Color = [11, 24, 37, 255];
  const trunkLight: Color = [35, 79, 103, 230];
  const needleDark: Color = [9, 46, 63, 255];
  const needleMid: Color = [16, 70, 92, 248];
  const needleLight: Color = [39, 121, 142, 232];
  const needleGlow: Color = [97, 178, 195, 170];
  const cx = surface.width * 0.5 + randomRange(rng, -6, 6);

  strokeQuadratic(
    surface,
    { x: cx - 6, y: surface.height - 12 },
    { x: cx + randomRange(rng, -12, 10), y: surface.height * 0.56 },
    { x: cx + randomRange(rng, -8, 7), y: 92 + randomRange(rng, -6, 8) },
    12,
    2.6,
    trunkDark,
    rng
  );
  strokeQuadratic(
    surface,
    { x: cx - 2, y: surface.height - 16 },
    { x: cx + randomRange(rng, -7, 8), y: surface.height * 0.58 },
    { x: cx + randomRange(rng, -5, 5), y: 96 + randomRange(rng, -5, 8) },
    5,
    1.3,
    trunkLight,
    rng
  );

  for (let i = 0; i < 8; i += 1) {
    const y = 130 + i * 24 + randomRange(rng, -5, 4);
    const length = 28 + i * 9 + randomRange(rng, -3, 5);
    const rise = randomRange(rng, 18, 30);
    const start = { x: cx + randomRange(rng, -4, 4), y };
    const leftEnd = { x: cx - length, y: y - rise };
    const rightEnd = { x: cx + length + randomRange(rng, -2, 6), y: y - rise + randomRange(rng, -2, 3) };
    strokeQuadratic(
      surface,
      start,
      { x: cx - length * 0.5 + randomRange(rng, -4, 4), y: y - rise * 0.7 + randomRange(rng, -3, 3) },
      leftEnd,
      4.5,
      1.2,
      trunkDark,
      rng
    );
    strokeQuadratic(
      surface,
      start,
      { x: cx + length * 0.54 + randomRange(rng, -4, 5), y: y - rise * 0.68 + randomRange(rng, -3, 3) },
      rightEnd,
      4.2,
      1.1,
      trunkDark,
      rng
    );
  }

  const tierCount = 9;
  for (let tier = 0; tier < tierCount; tier += 1) {
    const t = tier / (tierCount - 1);
    const topY = 34 + tier * 27 + randomRange(rng, -2, 3);
    const bottomY = topY + 52 + tier * 3 + randomRange(rng, -3, 4);
    const halfW = 18 + tier * 12 + randomRange(rng, -2, 5);
    const shade = tier < 3 ? needleLight : tier < 6 ? needleMid : needleDark;
    jaggedConeTier(surface, rng, cx + randomRange(rng, -3, 3), topY, bottomY, halfW, shade);
    if (tier > 1 && tier < 7 && rng() > 0.35) {
      jaggedConeTier(
        surface,
        rng,
        cx + randomRange(rng, -2, 2),
        topY + randomRange(rng, 2, 7),
        bottomY - randomRange(rng, 2, 6),
        halfW * randomRange(rng, 0.4, 0.7),
        needleGlow
      );
    }
    if (rng() > 0.72) {
      jaggedConeTier(
        surface,
        rng,
        cx + randomRange(rng, -3, 3),
        topY + randomRange(rng, 6, 9),
        bottomY - randomRange(rng, 1, 4),
        halfW * randomRange(rng, 0.62, 0.86),
        [6, 28, 42, Math.round(200 + (1 - t) * 28)]
      );
    }
  }
}

function drawOak(surface: Surface, seed: string) {
  const rng = mulberry32(hashSeed(seed));
  const trunkDark: Color = [11, 23, 35, 255];
  const trunkLight: Color = [43, 88, 108, 225];
  const leafDark: Color = [8, 43, 58, 250];
  const leafMid: Color = [16, 69, 90, 240];
  const leafLight: Color = [46, 124, 143, 228];
  const cx = surface.width * 0.5 + randomRange(rng, -10, 10);
  const trunkBaseY = surface.height - 10;

  strokeQuadratic(
    surface,
    { x: cx - 12, y: trunkBaseY },
    { x: cx + randomRange(rng, -22, 18), y: surface.height * 0.66 },
    { x: cx + randomRange(rng, -14, 10), y: 162 + randomRange(rng, -10, 10) },
    20,
    4,
    trunkDark,
    rng
  );
  strokeQuadratic(
    surface,
    { x: cx - 2, y: trunkBaseY - 8 },
    { x: cx + randomRange(rng, -15, 12), y: surface.height * 0.64 },
    { x: cx + randomRange(rng, -8, 8), y: 170 + randomRange(rng, -8, 8) },
    8,
    1.8,
    trunkLight,
    rng
  );

  for (let i = 0; i < 7; i += 1) {
    const y = 170 + i * 20 + randomRange(rng, -4, 5);
    const len = 34 + i * 8 + randomRange(rng, -4, 6);
    const rise = randomRange(rng, 22, 34);
    const start = { x: cx + randomRange(rng, -6, 6), y };

    strokeQuadratic(
      surface,
      start,
      { x: cx - len * 0.55 + randomRange(rng, -6, 6), y: y - rise * 0.62 + randomRange(rng, -5, 5) },
      { x: cx - len + randomRange(rng, -7, 5), y: y - rise + randomRange(rng, -5, 6) },
      6,
      1.3,
      trunkDark,
      rng
    );
    strokeQuadratic(
      surface,
      start,
      { x: cx + len * 0.58 + randomRange(rng, -6, 7), y: y - rise * 0.6 + randomRange(rng, -5, 5) },
      { x: cx + len + randomRange(rng, -5, 8), y: y - rise + randomRange(rng, -6, 6) },
      6,
      1.3,
      trunkDark,
      rng
    );
  }

  const clumps = randomRange(rng, 6, 8);
  for (let i = 0; i < clumps; i += 1) {
    const tone = i < 2 ? leafLight : i < 5 ? leafMid : leafDark;
    irregularBlob(
      surface,
      rng,
      cx + randomRange(rng, -68, 68),
      128 + randomRange(rng, -38, 60),
      randomRange(rng, 46, 82),
      randomRange(rng, 36, 64),
      Math.round(randomRange(rng, 12, 18)),
      tone
    );
  }

  for (let i = 0; i < 5; i += 1) {
    irregularBlob(
      surface,
      rng,
      cx + randomRange(rng, -50, 54),
      154 + randomRange(rng, -24, 28),
      randomRange(rng, 22, 36),
      randomRange(rng, 16, 28),
      Math.round(randomRange(rng, 9, 14)),
      [5, 25, 38, 170]
    );
  }
}

function drawSilhouette(surface: Surface, seed: string) {
  const rng = mulberry32(hashSeed(seed));
  const base: Color = [7, 22, 38, 152];
  const soft: Color = [12, 34, 54, 116];
  const cx = surface.width * 0.5 + randomRange(rng, -8, 8);
  const trunkBottom = surface.height - 8;

  strokeQuadratic(
    surface,
    { x: cx - 6, y: trunkBottom },
    { x: cx + randomRange(rng, -12, 12), y: surface.height * 0.62 },
    { x: cx + randomRange(rng, -8, 8), y: 150 + randomRange(rng, -8, 8) },
    13,
    3,
    base,
    rng
  );

  irregularBlob(surface, rng, cx + randomRange(rng, -8, 8), 150 + randomRange(rng, -8, 12), 72, 62, 13, base);
  irregularBlob(surface, rng, cx + randomRange(rng, -40, 40), 172 + randomRange(rng, -10, 12), 58, 44, 11, soft);
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

function crc32(buffer: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const chunk = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(chunk), 0);
  return Buffer.concat([length, chunk, crc]);
}

function encodePng(width: number, height: number, rgbaData: Uint8Array) {
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

function ensureDir(directory: string) {
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

  const pineA = new Surface(220, 360);
  drawPine(pineA, "pine-a");
  pineA.writePng(path.join(pineDir, "pine_a.png"));

  const pineB = new Surface(220, 360);
  drawPine(pineB, "pine-b");
  pineB.writePng(path.join(pineDir, "pine_b.png"));

  const oakA = new Surface(260, 360);
  drawOak(oakA, "oak-a");
  oakA.writePng(path.join(oakDir, "oak_a.png"));

  const oakB = new Surface(260, 360);
  drawOak(oakB, "oak-b");
  oakB.writePng(path.join(oakDir, "oak_b.png"));

  const silA = new Surface(220, 340);
  drawSilhouette(silA, "sil-a");
  silA.writePng(path.join(silhouetteDir, "sil_a.png"));

  const silB = new Surface(220, 340);
  drawSilhouette(silB, "sil-b");
  silB.writePng(path.join(silhouetteDir, "sil_b.png"));
}

outputTreeAtlas();
console.log("Generated placeholder tree atlas PNGs.");
