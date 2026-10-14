/**
 * OneBoard PWA 图标生成器（零依赖）
 *
 * 用纯 Node（zlib + 手写 PNG chunk）绘制品牌环形 Logo 图标，
 * 与 public/favicon.svg / CatLogo.vue 同一套视觉基因（#141414 底 + 白色圆环）。
 *
 * 产物：
 *  - public/apple-touch-icon.png        180×180 全出血（iOS 自行裁圆角）
 *  - public/icons/icon-192.png          192×192 圆角矩形（manifest purpose=any）
 *  - public/icons/icon-512.png          512×512 圆角矩形（manifest purpose=any）
 *  - public/icons/icon-maskable-192.png 192×192 全出血（Android 自适应图标安全区）
 *  - public/icons/icon-maskable-512.png 512×512 全出血
 *
 * 运行：node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(rootDir, 'public')
const iconsDir = path.join(publicDir, 'icons')

/* ── PNG 编码（RGBA8 + zlib deflate + CRC32） ── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  // 每行前置 filter byte 0（None），交给 zlib 压缩
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/* ── 绘制（SDF + 1.25px 平滑抗锯齿） ── */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** 有符号距离 → 覆盖率（负数在形状内） */
const coverage = (sd, aa = 1.25) => clamp01(0.5 - sd / aa)

/** 圆角矩形 SDF（居中，halfSize 为半宽高，radius 为圆角半径） */
function sdRoundRect(px, py, halfSize, radius) {
  const qx = Math.abs(px) - (halfSize - radius)
  const qy = Math.abs(py) - (halfSize - radius)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius
}

/**
 * 绘制品牌图标
 * @param {number} size 边长
 * @param {boolean} fullBleed true=铺满正方形（iOS / maskable），false=圆角矩形带透明角
 */
function drawIcon(size, fullBleed) {
  const rgba = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  // 与 favicon.svg 同比例：外环 10/32、内环 5.8/32（均落在 maskable 40% 安全区内）
  const ringOuter = size * 0.3125
  const ringInner = size * 0.18125
  const cornerRadius = size * 0.225 // 圆角矩形形态（近似 squircle 观感）
  const plate = { r: 0x14, g: 0x14, b: 0x14 }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5 - cx
      const py = y + 0.5 - cy
      const plateCov = fullBleed
        ? 1
        : coverage(sdRoundRect(px, py, size / 2, cornerRadius))
      if (plateCov <= 0) continue

      // 圆环 = 外圆覆盖 − 内圆覆盖
      const dist = Math.hypot(px, py)
      const ringCov = clamp01(coverage(dist - ringOuter) - coverage(dist - ringInner))

      const idx = (y * size + x) * 4
      rgba[idx] = Math.round(plate.r + (255 - plate.r) * ringCov)
      rgba[idx + 1] = Math.round(plate.g + (255 - plate.g) * ringCov)
      rgba[idx + 2] = Math.round(plate.b + (255 - plate.b) * ringCov)
      rgba[idx + 3] = Math.round(plateCov * 255)
    }
  }
  return encodePng(size, size, rgba)
}

/* ── 输出 ── */

fs.mkdirSync(iconsDir, { recursive: true })

const targets = [
  { file: path.join(publicDir, 'apple-touch-icon.png'), size: 180, fullBleed: true },
  { file: path.join(iconsDir, 'icon-192.png'), size: 192, fullBleed: false },
  { file: path.join(iconsDir, 'icon-512.png'), size: 512, fullBleed: false },
  { file: path.join(iconsDir, 'icon-maskable-192.png'), size: 192, fullBleed: true },
  { file: path.join(iconsDir, 'icon-maskable-512.png'), size: 512, fullBleed: true },
]

for (const { file, size, fullBleed } of targets) {
  const png = drawIcon(size, fullBleed)
  fs.writeFileSync(file, png)
  console.log(`✓ ${path.relative(rootDir, file)} (${size}×${size}, ${png.length} bytes)`)
}
console.log('PWA icons generated.')
