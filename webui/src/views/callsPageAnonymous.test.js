import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { babelParse, parse } from '@vue/compiler-sfc'
import { isRingingIncoming, liveCallsFrom } from './callsModel.js'

const source = readFileSync(new URL('./Calls.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source)
assert.deepEqual(errors, [])
const script = descriptor.scriptSetup.content
const ast = babelParse(script, { sourceType: 'module' })
const names = ['calls', 'liveCalls', 'ringingCall', 'activeCall']
const declarations = names.map((name) => {
  const statement = ast.program.body.find((node) => node.type === 'VariableDeclaration' &&
    node.declarations.some((declaration) => declaration.id.name === name))
  assert.ok(statement, `Calls.vue must declare ${name}`)
  return script.slice(statement.start, statement.end)
})

// Execute the actual page derivations with real Vue reactivity and model functions.
// No copied filter, browser/network side effects, or production test-only exports.
const createPageState = new Function('ref', 'computed', 'liveCallsFrom', 'isRingingIncoming',
  `${declarations.join('\n')}\nreturn { ${names.join(', ')} }`)

function pageState(items) {
  const page = createPageState(ref, computed, liveCallsFrom, isRingingIncoming)
  page.calls.value = items
  return page
}

function call(state, extra = {}) {
  return { id: `call-${state}`, deviceId: 'device-a', started_at: '2026-10-10T12:00:00Z',
    direction: 'incoming', state, media_ready: true, ...extra }
}

describe('Calls page live call derivation', () => {
  for (const [label, fields] of [['missing', {}], ['empty', { number: '' }], ['whitespace', { number: ' \t ' }]]) {
    for (const state of ['ringing', 'active']) {
      it(`keeps ${label}-number incoming ${state} visible and selectable`, () => {
        const item = call(state, fields)
        const page = pageState([item])
        assert.deepEqual(liveCallsFrom([item]), [item], 'model accepts this anonymous call')
        assert.deepEqual(page.liveCalls.value, [item], 'page must retain anonymous incoming calls')
        const selection = state === 'ringing' ? page.ringingCall : page.activeCall
        assert.equal(selection.value, page.calls.value[0], 'selection preserves the call identity')
      })
    }
  }

  it('keeps known-number calls and selects incoming ringing before active', () => {
    const items = [call('active', { number: '10001' }), call('ringing', { number: '10002' })]
    const page = pageState(items)
    assert.deepEqual(page.liveCalls.value, items)
    assert.equal(page.ringingCall.value, page.calls.value[1])
    assert.equal(page.activeCall.value, page.calls.value[0])
  })

  for (const state of ['dialing', 'early_media']) {
    it(`keeps outgoing ${state} with or without a number`, () => {
      const items = [call(state, { direction: 'outgoing' }),
        call(state, { id: 'known-outgoing', direction: 'outgoing', number: '10003' })]
      const page = pageState(items)
      assert.deepEqual(page.liveCalls.value, items)
      assert.equal(page.ringingCall.value, null)
      assert.equal(page.activeCall.value, state === 'dialing' ? page.calls.value[0] : null)
    })
  }

  it('excludes ended and failed calls regardless of direction or caller number', () => {
    const items = ['ended', 'failed'].flatMap((state) => ['incoming', 'outgoing'].flatMap((direction) =>
      [undefined, '', ' \t ', '10004'].map((number) => call(state, { direction, number }))))
    const page = pageState(items)
    assert.deepEqual(page.liveCalls.value, [])
    assert.equal(page.ringingCall.value, null)
    assert.equal(page.activeCall.value, null)
  })

  it('reacts to an anonymous call becoming active and then ending', () => {
    const page = pageState([call('ringing')])
    assert.equal(page.ringingCall.value, page.calls.value[0])
    page.calls.value[0].state = 'active'
    assert.equal(page.ringingCall.value, null)
    assert.equal(page.activeCall.value, page.calls.value[0])
    page.calls.value[0].state = 'ended'
    assert.deepEqual(page.liveCalls.value, [])
    assert.equal(page.activeCall.value, null)
  })
})
