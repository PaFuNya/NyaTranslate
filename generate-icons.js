/**
 * 图标生成脚本（Node.js 环境运行,零依赖）
 * 用途:生成猫娘品牌图标(圆角方块 + 猫耳 + 猫脸),输出到 icons/ 目录。
 * 运行方式:node generate-icons.js
 * 原理:自绘 RGBA 像素缓冲区,用 zlib 手工编码 PNG(IHDR/IDAT/IEND),无需 canvas 包。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── PNG 编码(最小实现) ─────────────────────────────────────────────────

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 将 RGBA 像素缓冲编码为 PNG Buffer */
function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  // 每行前加 filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ─── 绘制 ───────────────────────────────────────────────────────────────

/**
 * 品牌色:靛蓝→紫 对角渐变;脸用暖白;五官用靛蓝深色。
 * 几何(相对 S):背景圆角方块(圆角 0.22S)从 y0.18 起、高 0.82;
 * 双耳三角形立于方块顶;双眼圆点 y0.52、左右 x0.34/0.66;
 * 鼻与微笑嘴;两侧各 2 根胡须。
 */
function drawCatIcon(size) {
  const S = size;
  const px = Buffer.alloc(S * S * 4);

  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  const inRoundedRect = (x, y, rx, ry, w, h, rad) => {
    if (x < rx || x >= rx + w || y < ry || y >= ry + h) return false;
    const cx = Math.max(rx + rad, Math.min(x, rx + w - 1 - rad));
    const cy = Math.max(ry + rad, Math.min(y, ry + h - 1 - rad));
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= rad * rad;
  };

  const fillRoundedRect = (rx, ry, w, h, rad, r, g, b, a = 255) => {
    for (let y = Math.max(0, Math.floor(ry)); y < Math.min(S, Math.ceil(ry + h)); y++) {
      for (let x = Math.max(0, Math.floor(rx)); x < Math.min(S, Math.ceil(rx + w)); x++) {
        if (inRoundedRect(x, y, rx, ry, w, h, rad)) set(x, y, r, g, b, a);
      }
    }
  };

  const fillCircle = (cx, cy, rad, r, g, b, a = 255) => {
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
      for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= rad * rad) set(x, y, r, g, b, a);
      }
    }
  };

  // 背景:透明画布上绘制品牌渐变圆角方块与猫耳
  const gradTop = [91, 106, 240];   // #5b6af0
  const gradBot = [124, 58, 237];   // #7c3aed
  const gradAt = (y) => {
    const t = Math.min(1, Math.max(0, (y - 0.18 * S) / (0.82 * S)));
    return [
      Math.round(gradTop[0] + (gradBot[0] - gradTop[0]) * t),
      Math.round(gradTop[1] + (gradBot[1] - gradTop[1]) * t),
      Math.round(gradTop[2] + (gradBot[2] - gradTop[2]) * t),
    ];
  };

  const bodyTop = 0.18 * S;
  const bodyH = 0.82 * S;
  const rad = 0.22 * S;

  // 逐像素填充主体(渐变)
  for (let y = 0; y < S; y++) {
    if (y < bodyTop - rad * 0.4 || y > bodyTop + bodyH - 1) continue;
    const [r, g, b] = gradAt(y);
    for (let x = 0; x < S; x++) {
      if (inRoundedRect(x, y, 0, bodyTop, S, bodyH, rad)) set(x, y, r, g, b, 255);
    }
  }

  // 双耳:以方块顶部为底边的圆角三角形(简化为两个倾斜圆角矩形块)
  const earW = 0.30 * S, earH = 0.30 * S;
  const earY = bodyTop - earH * 0.62;
  const drawEar = (cx) => {
    // 用两段填充模拟三角形:从顶到底逐行收窄
    for (let row = 0; row < earH; row++) {
      const y = earY + row;
      const t = row / earH;
      const half = earW * 0.5 * (0.25 + 0.75 * t);
      const [r, g, b] = gradAt(bodyTop);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        // 内耳(浅色三角)缩小 0.6
        const halfIn = half * 0.55;
        if (x >= cx - halfIn && x <= cx + halfIn && t > 0.3) {
          set(x, y, 255, 214, 214, 255);
        } else {
          set(x, y, r, g, b, 255);
        }
      }
    }
  };
  drawEar(0.24 * S);
  drawEar(0.76 * S);

  // 猫脸(暖白圆)
  const faceCx = 0.5 * S, faceCy = 0.55 * S, faceR = 0.17 * S;
  fillCircle(faceCx, faceCy, faceR, 255, 246, 237, 255);

  // 眼睛(品牌深靛蓝,竖椭圆感用两个叠加圆)
  const eyeY = faceCy - 0.02 * S, eyeR = Math.max(1, 0.035 * S);
  fillCircle(faceCx - 0.085 * S, eyeY, eyeR, 30, 41, 92, 255);
  fillCircle(faceCx + 0.085 * S, eyeY, eyeR, 30, 41, 92, 255);

  // 鼻 + 微笑嘴
  fillCircle(faceCx, faceCy + 0.045 * S, Math.max(1, 0.022 * S), 122, 90, 140, 255);
  const mouthY = faceCy + 0.085 * S, mouthR = Math.max(1, 0.035 * S);
  fillRoundedRect(faceCx - mouthR * 1.6, mouthY, mouthR * 3.2, mouthR * 0.9, mouthR * 0.4, 30, 41, 92, 255);

  // 胡须(暖白 2 根/侧)
  if (S >= 48) {
    const wY1 = faceCy + 0.02 * S, wY2 = faceCy + 0.06 * S;
    const whisker = (x0, y0, x1, len) => {
      for (let i = 0; i <= len; i++) {
        const t = i / len;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + t * 0.12 * S);
        fillCircle(x, y, Math.max(0.6, S * 0.004), 255, 255, 255, 200);
      }
    };
    whisker(faceCx - faceR, wY1, faceCx - faceR - 0.14 * S, 0.14 * S);
    whisker(faceCx - faceR, wY2, faceCx - faceR - 0.13 * S, 0.13 * S);
    whisker(faceCx + faceR, wY1, faceCx + faceR + 0.14 * S, 0.14 * S);
    whisker(faceCx + faceR, wY2, faceCx + faceR + 0.13 * S, 0.13 * S);
  }

  return encodePng(S, px);
}

// ─── 输出 ───────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

[16, 48, 128].forEach((size) => {
  const png = drawCatIcon(size);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓ ${file} (${png.length} bytes)`);
});

console.log('图标生成完成:猫耳圆角方块 + 猫脸,品牌渐变 #5b6af0→#7c3aed。');
