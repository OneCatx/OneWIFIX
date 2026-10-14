#!/usr/bin/env node
/**
 * Generate simplified offline SVG flags → public/flags/{iso}.svg
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'flags')

/** @typedef {{ type: string, [key: string]: unknown }} FlagDef */

/** @type {Record<string, FlagDef>} */
const FLAG_DEFS = {
  US: { type: 'us' },
  GB: { type: 'uk' },
  HK: { type: 'hk' },
  JP: { type: 'jp' },
  SG: { type: 'sg' },
  CN: { type: 'cn' },
  TW: { type: 'tw' },
  KR: { type: 'kr' },
  DE: { type: 'h3', colors: ['#000', '#DD0000', '#FFCE00'] },
  NL: { type: 'h3', colors: ['#AE1C28', '#FFF', '#21468B'] },
  FR: { type: 'v3', colors: ['#0055A4', '#FFF', '#EF4135'] },
  CA: { type: 'ca' },
  AU: { type: 'au' },
  NZ: { type: 'nz' },
  MY: { type: 'my' },
  TH: { type: 'th' },
  VN: { type: 'vn' },
  PH: { type: 'ph' },
  ID: { type: 'h2', colors: ['#FF0000', '#FFF'] },
  IN: { type: 'in' },
  TR: { type: 'tr' },
  BR: { type: 'br' },
  AR: { type: 'h3', colors: ['#74ACDF', '#FFF', '#74ACDF'] },
  MX: { type: 'v3', colors: ['#006847', '#FFF', '#CE1126'] },
  CL: { type: 'cl' },
  CO: { type: 'h3', colors: ['#FCD116', '#003893', '#CE1126'] },
  PE: { type: 'v3', colors: ['#D91023', '#FFF', '#D91023'] },
  RU: { type: 'h3', colors: ['#FFF', '#0039A6', '#D52B1E'] },
  UA: { type: 'h2', colors: ['#005BBB', '#FFD500'] },
  PL: { type: 'h2', colors: ['#FFF', '#DC143C'] },
  SE: { type: 'nordic', bg: '#006AA7', cross: '#FECC00' },
  NO: { type: 'nordic', bg: '#BA0C2F', cross: '#FFF', inner: '#00205B' },
  FI: { type: 'nordic', bg: '#FFF', cross: '#003580' },
  DK: { type: 'nordic', bg: '#C8102E', cross: '#FFF' },
  ES: { type: 'h3', colors: ['#AA151B', '#F1BF00', '#AA151B'], weights: [1, 2, 1] },
  PT: { type: 'v2', colors: ['#006600', '#FF0000'], split: 0.4 },
  IT: { type: 'v3', colors: ['#009246', '#FFF', '#CE2B37'] },
  CH: { type: 'cross', bg: '#FF0000', cross: '#FFF' },
  AT: { type: 'h3', colors: ['#ED2939', '#FFF', '#ED2939'] },
  BE: { type: 'v3', colors: ['#000', '#FAE042', '#ED2939'] },
  IE: { type: 'v3', colors: ['#169B62', '#FFF', '#FF883E'] },
  CZ: { type: 'cz' },
  HU: { type: 'h3', colors: ['#CE2939', '#FFF', '#436F4D'] },
  RO: { type: 'v3', colors: ['#002B7F', '#FCD116', '#CE1126'] },
  GR: { type: 'gr' },
  IL: { type: 'il' },
  AE: { type: 'v4', colors: ['#00732F', '#FFF', '#000', '#FF0000'] },
  SA: { type: 'solid', color: '#006C35' },
  ZA: { type: 'za' },
  EG: { type: 'h3', colors: ['#CE1126', '#FFF', '#000'] },
  NG: { type: 'v3', colors: ['#008751', '#FFF', '#008751'] },
  KE: { type: 'ke' },
  MA: { type: 'ma' },
  PK: { type: 'pk' },
  BD: { type: 'bd' },
  LK: { type: 'lk' },
  NP: { type: 'np' },
  KH: { type: 'h2', colors: ['#032EA1', '#E00025'] },
  LA: { type: 'h3', colors: ['#CE1126', '#002868', '#CE1126'] },
  MM: { type: 'h3', colors: ['#FECB00', '#34B233', '#EA2839'] },
}

function svgWrap(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">${body}</svg>`
}

function hStripes(colors, weights) {
  const w = weights || colors.map(() => 1)
  const total = w.reduce((a, b) => a + b, 0)
  let y = 0
  return colors.map((c, i) => {
    const h = (480 * w[i]) / total
    const rect = `<rect x="0" y="${y}" width="640" height="${h}" fill="${c}"/>`
    y += h
    return rect
  }).join('')
}

function vStripes(colors) {
  const w = 640 / colors.length
  return colors.map((c, i) => `<rect x="${i * w}" y="0" width="${w}" height="480" fill="${c}"/>`).join('')
}

function renderFlag(def) {
  switch (def.type) {
    case 'h2':
      return svgWrap(hStripes(def.colors))
    case 'h3':
      return svgWrap(hStripes(def.colors, def.weights))
    case 'v2':
      return svgWrap(`<rect width="256" height="480" fill="${def.colors[0]}"/><rect x="256" width="384" height="480" fill="${def.colors[1]}"/>`)
    case 'v3':
      return svgWrap(vStripes(def.colors))
    case 'v4': {
      const w = 640 / 4
      return svgWrap(def.colors.map((c, i) => `<rect x="${i * w}" y="0" width="${w}" height="480" fill="${c}"/>`).join(''))
    }
    case 'solid':
      return svgWrap(`<rect width="640" height="480" fill="${def.color}"/>`)
    case 'cross':
      return svgWrap(`<rect width="640" height="480" fill="${def.bg}"/><rect x="260" y="0" width="120" height="480" fill="${def.cross}"/><rect x="0" y="180" width="640" height="120" fill="${def.cross}"/>`)
    case 'nordic': {
      const inner = def.inner
        ? `<rect x="200" y="0" width="80" height="480" fill="${def.inner}"/><rect x="0" y="160" width="640" height="80" fill="${def.inner}"/>`
        : ''
      return svgWrap(`<rect width="640" height="480" fill="${def.bg}"/><rect x="180" y="0" width="100" height="480" fill="${def.cross}"/><rect x="0" y="190" width="640" height="100" fill="${def.cross}"/>${inner}`)
    }
    case 'jp':
      return svgWrap('<rect width="640" height="480" fill="#FFF"/><circle cx="320" cy="240" r="120" fill="#BC002D"/>')
    case 'cn':
      return svgWrap('<rect width="640" height="480" fill="#DE2910"/><polygon points="120,80 135,125 182,125 144,152 158,198 120,170 82,198 96,152 58,125 105,125" fill="#FFDE00"/>')
    case 'tw':
      return svgWrap('<rect width="320" height="240" fill="#000095"/><rect x="320" y="0" width="320" height="240" fill="#FE0000"/><rect x="0" y="240" width="320" height="240" fill="#FE0000"/><rect x="320" y="240" width="320" height="240" fill="#000095"/><circle cx="160" cy="120" r="60" fill="#FFF"/><circle cx="175" cy="120" r="45" fill="#000095"/>')
    case 'kr':
      return svgWrap('<rect width="640" height="480" fill="#FFF"/><circle cx="320" cy="240" r="80" fill="#CD2E3A"/><path d="M320 160 A80 80 0 0 1 320 320 A40 40 0 0 0 320 160Z" fill="#0047A0"/><path d="M320 320 A80 80 0 0 1 320 160 A40 40 0 0 0 320 320Z" fill="#0047A0"/>')
    case 'hk':
      return svgWrap('<rect width="640" height="480" fill="#DE2910"/><circle cx="320" cy="240" r="90" fill="#FFF" opacity="0.92"/><circle cx="320" cy="240" r="55" fill="#DE2910"/>')
    case 'sg':
      return svgWrap('<rect width="640" height="240" fill="#EF3340"/><rect y="240" width="640" height="240" fill="#FFF"/><circle cx="170" cy="120" r="55" fill="#FFF"/><circle cx="188" cy="120" r="45" fill="#EF3340"/>')
    case 'us':
      return svgWrap(`${hStripes(['#B22234', '#FFF', '#B22234', '#FFF', '#B22234', '#FFF', '#B22234', '#FFF', '#B22234'], [1,1,1,1,1,1,1,1,1])}<rect width="256" height="259" fill="#3C3B6E"/>`)
    case 'uk':
      return svgWrap('<rect width="640" height="480" fill="#012169"/><path d="M0,0 L640,480 M640,0 L0,480" stroke="#FFF" stroke-width="80"/><path d="M0,0 L640,480 M640,0 L0,480" stroke="#C8102E" stroke-width="48"/><rect x="260" width="120" height="480" fill="#FFF"/><rect y="180" width="640" height="120" fill="#FFF"/><rect x="280" width="80" height="480" fill="#C8102E"/><rect y="200" width="640" height="80" fill="#C8102E"/>')
    case 'ca':
      return svgWrap('<rect width="160" height="480" fill="#FF0000"/><rect x="160" width="320" height="480" fill="#FFF"/><rect x="480" width="160" height="480" fill="#FF0000"/><polygon points="320,140 340,210 415,210 355,255 375,325 320,280 265,325 285,255 225,210 300,210" fill="#FF0000"/>')
    case 'au':
      return svgWrap('<rect width="640" height="480" fill="#00008B"/><rect width="320" height="240" fill="#012169"/><path d="M0,0 L320,240 M320,0 L0,240" stroke="#FFF" stroke-width="40"/><path d="M0,0 L320,240 M320,0 L0,240" stroke="#C8102E" stroke-width="24"/><rect x="130" width="60" height="240" fill="#FFF"/><rect y="90" width="320" height="60" fill="#FFF"/><rect x="145" width="30" height="240" fill="#C8102E"/><rect y="105" width="320" height="30" fill="#C8102E"/>')
    case 'nz':
      return svgWrap('<rect width="640" height="480" fill="#012169"/><rect width="256" height="192" fill="#012169"/><path d="M0,0 L256,192 M256,0 L0,192" stroke="#FFF" stroke-width="32"/><path d="M0,0 L256,192 M256,0 L0,192" stroke="#C8102E" stroke-width="18"/><circle cx="480" cy="120" r="8" fill="#FFF"/><circle cx="520" cy="160" r="8" fill="#FFF"/><circle cx="440" cy="180" r="8" fill="#FFF"/><circle cx="500" cy="220" r="8" fill="#FFF"/>')
    case 'my':
      return svgWrap('<rect width="640" height="240" fill="#CC0001"/><rect y="240" width="640" height="240" fill="#FFF"/><rect width="320" height="480" fill="#010066"/><circle cx="160" cy="240" r="70" fill="#FFCC00"/>')
    case 'th':
      return svgWrap(hStripes(['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'], [1, 1, 2, 1, 1]))
    case 'vn':
      return svgWrap('<rect width="640" height="480" fill="#DA251D"/><polygon points="320,100 360,220 480,220 385,290 420,410 320,335 220,410 255,290 160,220 280,220" fill="#FFCD00"/>')
    case 'ph':
      return svgWrap('<rect width="640" height="240" fill="#0038A8"/><rect y="240" width="640" height="240" fill="#CE1126"/><polygon points="0,0 320,240 0,480" fill="#FFF"/><circle cx="120" cy="240" r="50" fill="#FCD116"/>')
    case 'in':
      return svgWrap(`${hStripes(['#FF9933', '#FFF', '#138808'])}<circle cx="320" cy="240" r="40" fill="none" stroke="#000080" stroke-width="8"/>`)
    case 'tr':
      return svgWrap('<rect width="640" height="480" fill="#E30A17"/><circle cx="260" cy="240" r="80" fill="#FFF"/><circle cx="280" cy="240" r="64" fill="#E30A17"/><polygon points="360,240 400,255 385,220 415,195 375,195 360,160 345,195 305,195 335,220 320,255" fill="#FFF"/>')
    case 'br':
      return svgWrap('<rect width="640" height="480" fill="#009739"/><polygon points="320,40 580,240 320,440 60,240" fill="#FFDF00"/><circle cx="320" cy="240" r="100" fill="#002776"/>')
    case 'cl':
      return svgWrap('<rect width="640" height="240" fill="#FFF"/><rect y="240" width="640" height="240" fill="#D52B1E"/><rect width="240" height="240" fill="#0039A6"/><polygon points="120,60 135,105 182,105 144,132 158,178 120,150 82,178 96,132 58,105 105,105" fill="#FFF"/>')
    case 'cz':
      return svgWrap('<rect width="640" height="240" fill="#FFF"/><rect y="240" width="640" height="240" fill="#D7141A"/><polygon points="0,0 320,240 0,480" fill="#11457E"/>')
    case 'gr':
      return svgWrap(`${Array.from({ length: 9 }, (_, i) => `<rect y="${i * 53.33}" width="640" height="53.33" fill="${i % 2 ? '#0D5EAF' : '#FFF'}"/>`).join('')}<rect width="213" height="160" fill="#0D5EAF"/><rect x="85" width="43" height="160" fill="#FFF"/><rect y="64" width="213" height="32" fill="#FFF"/>`)
    case 'il':
      return svgWrap(`${hStripes(['#FFF', '#0038B8', '#FFF'], [4, 1, 4])}<polygon points="320,170 335,210 378,210 343,235 357,275 320,250 283,275 297,235 262,210 305,210" fill="none" stroke="#0038B8" stroke-width="6"/>`)
    case 'za':
      return svgWrap('<polygon points="0,0 640,0 320,240" fill="#007A4D"/><polygon points="0,0 320,240 0,480" fill="#000"/><polygon points="640,0 640,480 320,240" fill="#FFB612"/><polygon points="0,480 640,480 320,240" fill="#DE3831"/><polygon points="0,0 0,480 320,240" fill="#002395"/>')
    case 'ke':
      return svgWrap(`${hStripes(['#000', '#BB0000', '#006600'], [1, 1, 1])}<rect x="0" y="0" width="640" height="40" fill="#FFF"/><polygon points="0,40 200,240 0,440" fill="#000"/>`)
    case 'ma':
      return svgWrap('<rect width="640" height="480" fill="#C1272D"/><polygon points="320,120 340,185 410,185 355,225 375,290 320,250 265,290 285,225 230,185 300,185" fill="#006233" stroke="#006233"/>')
    case 'pk':
      return svgWrap('<rect width="480" height="480" fill="#01411C"/><rect x="480" width="160" height="480" fill="#FFF"/><circle cx="480" cy="240" r="70" fill="#01411C"/><circle cx="500" cy="240" r="58" fill="#FFF"/>')
    case 'bd':
      return svgWrap('<rect width="640" height="480" fill="#006A4E"/><circle cx="280" cy="240" r="100" fill="#F42A41"/>')
    case 'lk':
      return svgWrap('<rect width="640" height="480" fill="#FFBE29"/><rect x="160" width="320" height="480" fill="#8D153A"/><rect x="480" width="160" height="480" fill="#00534E"/>')
    case 'np':
      return svgWrap('<polygon points="0,0 640,0 640,480 0,480" fill="#DC143C"/><polygon points="20,20 620,20 600,460 40,460" fill="#003893"/><polygon points="40,40 580,40 560,440 60,440" fill="#DC143C"/>')
    default:
      return svgWrap('<rect width="640" height="480" fill="#334155"/><circle cx="320" cy="240" r="100" fill="none" stroke="#94A3B8" stroke-width="8"/>')
  }
}

fs.mkdirSync(outDir, { recursive: true })
for (const [code, def] of Object.entries(FLAG_DEFS)) {
  const file = path.join(outDir, `${code.toLowerCase()}.svg`)
  fs.writeFileSync(file, renderFlag(def), 'utf8')
  console.log(`wrote ${file}`)
}
console.log(`Done: ${Object.keys(FLAG_DEFS).length} flags`)
