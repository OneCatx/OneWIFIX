import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseOnewifiDetail, onewifiErrorMessage } from './onewifiDetail.js'

describe('parseOnewifiDetail', () => {
  it('reads nested error.message', () => {
    assert.equal(parseOnewifiDetail({ error: { code: 'invalid_request', message: 'unknown field' } }), 'unknown field')
  })

  it('does not stringify error objects', () => {
    assert.notEqual(parseOnewifiDetail({ error: { code: 'x' } }), '[object Object]')
  })

  it('falls back to status copy', () => {
    assert.match(onewifiErrorMessage({}, 503), /服务暂时不可用/)
  })
})
