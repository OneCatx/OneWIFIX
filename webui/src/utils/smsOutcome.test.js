import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { smsOutcomeLabel } from './smsOutcome.js'

describe('smsOutcomeLabel', () => {
  it('maps send outcomes', () => {
    assert.equal(smsOutcomeLabel('delivered'), '已送达')
    assert.equal(smsOutcomeLabel('partial'), '部分送达')
    assert.equal(smsOutcomeLabel('accepted_unconfirmed'), '已提交，等待回执')
    assert.equal(smsOutcomeLabel(''), '')
  })
})
