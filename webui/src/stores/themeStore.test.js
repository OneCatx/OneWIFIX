import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const memory = new Map()

globalThis.localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null
  },
  setItem(key, value) {
    memory.set(key, String(value))
  },
  removeItem(key) {
    memory.delete(key)
  },
}

const metas = []
const root = { dataset: {}, style: {} }

globalThis.document = {
  documentElement: root,
  head: { appendChild(node) { metas.push(node) } },
  querySelectorAll(selector) {
    if (String(selector).includes('[media]')) return metas.filter((node) => node.attrs.media)
    return []
  },
  querySelector(selector) {
    if (!String(selector).includes('theme-color')) return null
    return metas.find((node) => node.attrs.name === 'theme-color' && !node.attrs.media) || null
  },
  createElement() {
    return {
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value },
    }
  },
}

globalThis.window = {
  matchMedia() {
    return { matches: true, addEventListener() {} }
  },
}

const { themeState, setThemeSkin, setThemeMode, initTheme } = await import('./theme.js')

describe('theme skin switch', () => {
  it('keeps OneWIFI by default and restores the classic colors', () => {
    initTheme()
    assert.equal(themeState.skin, 'onewifi')
    assert.equal(root.dataset.skin, 'onewifi')
    assert.equal(themeColor(), '#071723')

    setThemeSkin('classic')
    assert.equal(themeState.skin, 'classic')
    assert.equal(root.dataset.skin, undefined)
    assert.equal(localStorage.getItem('oneboard-skin'), 'classic')
    assert.equal(themeColor(), '#070812')

    setThemeMode('light')
    assert.equal(root.dataset.theme, 'light')
    assert.equal(themeColor(), '#f2f0eb')

    setThemeSkin('onewifi')
    assert.equal(root.dataset.skin, 'onewifi')
    assert.equal(themeColor(), '#F2F7FB')
  })
})

function themeColor() {
  const meta = metas.find((node) => node.attrs.name === 'theme-color' && !node.attrs.media)
  return meta ? meta.attrs.content : ''
}
