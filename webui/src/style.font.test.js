import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const style = readFileSync(join(here, 'style.css'), 'utf8')
const polish = readFileSync(join(here, 'assets/polish.css'), 'utf8')
const login = readFileSync(join(here, 'assets/login.css'), 'utf8')
const hero = readFileSync(join(here, 'assets/status-hero-cosmic.css'), 'utf8')
const html = readFileSync(join(here, '../index.html'), 'utf8')

describe('system CJK font stack', () => {
  it('uses a domestic UI stack and does not load Google/Roboto webfonts', () => {
    assert.match(style, /Microsoft YaHei UI/)
    assert.match(polish, /Microsoft YaHei UI/)
    assert.match(html, /Microsoft YaHei UI/)
    assert.doesNotMatch(style, /Roboto|Bebas Neue|SimSun|Songti|STSong/)
    assert.doesNotMatch(polish, /Roboto|Bebas Neue|SimSun|Songti|STSong/)
    assert.doesNotMatch(login, /Roboto|Bebas Neue/)
    assert.doesNotMatch(hero, /'Roboto'|Roboto/)
    assert.match(hero, /@font-face/)
    assert.match(hero, /font-family: 'Bebas Neue'/)
    assert.match(hero, /\/fonts\/bebas-neue-latin\.woff2/)
    assert.match(hero, /\.status-hero__title\.status-hero__title--display[\s\S]*Bebas Neue/)
    assert.doesNotMatch(html, /fonts\/fonts\.css/)
    assert.doesNotMatch(html, /roboto-latin/)
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/)
  })

  it('does not start the login entrance animation at opacity 0', () => {
    assert.match(login, /@keyframes auth-rise/)
    assert.doesNotMatch(login, /@keyframes auth-rise \{\s*from \{[^}]*opacity:\s*0(?!\.)/)
    assert.match(login, /prefers-reduced-motion:\s*reduce/)
    assert.match(login, /\.auth-stage \{[^}]*animation:\s*none/)
  })
})
