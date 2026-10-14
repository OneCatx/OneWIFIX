import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const hero = readFileSync(join(here, 'ControlPlaneHero.vue'), 'utf8')
const cosmic = readFileSync(join(here, '../assets/status-hero-cosmic.css'), 'utf8')
const pages = readFileSync(join(here, '../assets/onewifi-pages.css'), 'utf8')

describe('control plane hero', () => {
  it('uses OneRoot left orbit / right type and drops the circuit chip', () => {
    assert.match(hero, /READY ORBIT/)
    assert.match(hero, /hero-orbit/)
    assert.match(hero, /status-hero__copy/)
    assert.doesNotMatch(hero, /hero-circuit/)
    assert.doesNotMatch(hero, /hero-orbit glass-frame/)
  })

  it('restores Bebas Neue on the ONEWIFI wordmark only', () => {
    assert.match(cosmic, /@font-face[\s\S]*Bebas Neue[\s\S]*bebas-neue-latin\.woff2/)
    assert.match(cosmic, /\.status-hero__title\.status-hero__title--display[\s\S]*font-family:\s*'Bebas Neue'/)
    assert.doesNotMatch(cosmic, /\.status-hero__tagline[\s\S]{0,180}Bebas Neue/)
    assert.doesNotMatch(cosmic, /fonts\.googleapis|fonts\.gstatic/)
  })

  it('adds a right-side orbit deco and drops the left dark well', () => {
    assert.match(hero, /status-hero__deco/)
    assert.match(hero, /status-hero__deco[\s\S]*aria-hidden/)
    assert.doesNotMatch(
      cosmic,
      /\.hero-orbit\s*\{[^}]*linear-gradient\(145deg,\s*#12161c/,
    )
  })
})

describe('ow-page glass', () => {
  it('does not flatten glass-frame into an opaque slab', () => {
    assert.doesNotMatch(pages, /\[data-theme='dark'\] \.ow-page \.glass-frame/)
  })
})
