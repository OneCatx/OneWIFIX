import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const rootCss = readFileSync(join(here, '../../../onewifi-theme.css'))
const assetCss = readFileSync(join(here, '../assets/onewifi-theme.css'))
const theme = readFileSync(join(here, 'theme.js'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const settings = readFileSync(join(here, '../views/Settings.vue'), 'utf8')
const css = assetCss.toString('utf8')

describe('two skins', () => {
  it('keeps the OneWIFI overlay identical and scoped to data-skin', () => {
    assert.deepEqual(rootCss, assetCss)
    assert.match(css, /html\[data-skin="onewifi"\]/)
    assert.doesNotMatch(css, /htmlhtml/)
    assert.doesNotMatch(css, /^:root\b/m)
    assert.doesNotMatch(css, /^\[data-theme=/m)
    assert.doesNotMatch(css, /^html\[data-theme=/m)
    let depth = 0
    for (const ch of css) {
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      assert.ok(depth >= 0)
    }
    assert.equal(depth, 0)
  })

  it('defaults to OneWIFI and can fall back to the classic canvas', () => {
    assert.match(theme, /classic: \{ dark: '#070812', light: '#f2f0eb' \}/)
    assert.match(theme, /onewifi: \{ dark: '#071723', light: '#F2F7FB' \}/)
    assert.match(theme, /setThemeSkin/)
    assert.match(html, /oneboard-skin/)
    assert.match(html, /#070812/)
    assert.match(html, /#f2f0eb/)
    assert.match(html, /data-skin/)
    assert.match(settings, /setThemeSkin\('onewifi'\)/)
    assert.match(settings, /setThemeSkin\('classic'\)/)
  })
})
