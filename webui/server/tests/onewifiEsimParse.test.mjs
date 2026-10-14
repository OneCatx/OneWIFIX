import test from 'node:test'
import assert from 'node:assert/strict'
import { onewifiEsimHint, parseOnewifiEsimPayload } from '../../src/utils/onewifiModel.js'

test('parseOnewifiEsimPayload 认 lpac camelCase profileState', () => {
  const list = parseOnewifiEsimPayload({
    ok: true,
    ses: [{
      eid: 'eid-hk',
      profiles: [
        {
          iccid: '8985203103012517828',
          profileState: 'enabled',
          profileName: '3 Hong Kong',
          serviceProviderName: '3 Hong Kong',
        },
        {
          iccid: '8965012411180720352',
          profileState: 'disabled',
          profileName: 'Eskimo',
          serviceProviderName: 'Eskimo',
        },
      ],
    }],
    profiles: [],
  })
  assert.equal(list.length, 2)
  assert.equal(list[0].active, true)
  assert.equal(list[0].name, '3 Hong Kong')
  assert.equal(list[0].provider, '3 Hong Kong')
  assert.equal(list[1].active, false)
  assert.equal(list[1].name, 'Eskimo')
})

test('parseOnewifiEsimPayload 认 ses[]', () => {
  const list = parseOnewifiEsimPayload({
    cached: true,
    ses: [{
      eid: 'eid-1',
      profiles: [
        { iccid: '8985200', name: 'O2', state: 'enabled', service_provider_name: 'O2' },
        { iccid: '8985201', state: 'disabled', service_provider_name: 'EE' },
      ],
    }],
  })
  assert.equal(list.length, 2)
  assert.equal(list[0].active, true)
  assert.equal(list[0].name, 'O2')
  assert.equal(list[1].active, false)
  assert.equal(list[1].provider, 'EE')
})

test('parseOnewifiEsimPayload cached 空 ses 得到空列表', () => {
  assert.deepEqual(parseOnewifiEsimPayload({ cached: false, ses: [] }), [])
})

test('onewifiEsimHint 把 lpac 缺失从空列表里拆出来', () => {
  const payload = {
    ok: true,
    ses: [{ profiles: [], error: 'lpac binary not found at /data/lpac/lpac. Build it with: sudo ./install.sh build-lpac' }],
    profiles: [],
  }
  assert.equal(parseOnewifiEsimPayload(payload).length, 0)
  assert.match(onewifiEsimHint(payload, []), /没有装 lpac/)
})

test('onewifiEsimHint 普通 USIM 不说成没配置', () => {
  assert.match(
    onewifiEsimHint({ ses: [{ error: 'This card does not appear to be an eUICC / eSIM. Ordinary USIM cards cannot be managed here.' }] }, []),
    /读芯片|普通 SIM/,
  )
})
