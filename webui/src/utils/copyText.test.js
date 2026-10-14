import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { copyText } from './copyText.js'

describe('copyText', () => {
  it('empty string is not copied', async () => {
    assert.equal(await copyText(''), false)
  })

  it('uses clipboard.writeText when the API is there', async () => {
    const writes = []
    const ok = await copyText('onetools://onewifi?u=https%3A%2F%2Fx&t=tok', {
      clipboard: {
        async writeText(text) {
          writes.push(text)
        },
      },
    })
    assert.equal(ok, true)
    assert.deepEqual(writes, ['onetools://onewifi?u=https%3A%2F%2Fx&t=tok'])
  })

  it('falls back to execCommand when clipboard.writeText throws', async () => {
    let copied = ''
    const ok = await copyText('{"v":1}', {
      clipboard: {
        async writeText() {
          throw new Error('NotAllowedError')
        },
      },
      document: {
        body: {
          appendChild() {},
        },
        createElement() {
          return {
            setAttribute() {},
            style: { cssText: '' },
            focus() {},
            select() {},
            setSelectionRange() {},
            remove() {},
            set value(next) {
              copied = next
            },
            get value() {
              return copied
            },
          }
        },
        execCommand(name) {
          return name === 'copy' && copied === '{"v":1}'
        },
      },
    })
    assert.equal(ok, true)
  })
})
