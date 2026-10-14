import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTK_SE0_AID,
  ESTK_SE1_AID,
  GSMA_ISD_R_AID,
  XESIM_ISD_R_AID,
  BER5_ISD_R_AID,
  ESIM_ME_ISD_R_AID,
  LINKSFIELD_ISD_R_AID,
  EUICC_SKU_DATABASE,
  chipMakerFromEid,
  decorateEuiccHardware,
  resolveEuiccProduct,
} from './euiccCardCatalog.js'

describe('euicc card catalog', () => {
  it('keeps the common-market removable SKUs in the frozen database', () => {
    const ids = EUICC_SKU_DATABASE.map((item) => item.id)
    for (const id of [
      'estk-max', 'estk-plus-plus', 'estk-c-beta', 'estk-plus', 'estk-light',
      'estk-ready-plus', 'estk-mega', 'estk-eco', 'tianlian',
      'xesim', 'xesim-x1', 'xesim-x2', 'xesim-x2-pro',
      '5ber', '5ber-standard', '5ber-premium', '5ber-ultra',
      'esim-me', 'esim-me-card-2', 'linksfield',
      '9esim', '9esim-v0', '9esim-v0-max', '9esim-v3',
      'sysmo-c2g', 'sysmo-c2t', 'jmp',
      'switch-esim', 'switch-pro', 'switch-max', 'eiotclub',
    ]) {
      assert.ok(ids.includes(id), `missing sku ${id}`)
    }
  })

  it('treats ESTK SE0+SE1 as Max dual eUICC, not a Thales brand', () => {
    const product = resolveEuiccProduct({
      aids: [ESTK_SE0_AID, ESTK_SE1_AID],
      eids: ['8903302300000001', '8903302300000002'],
    })
    assert.equal(product.brand, 'ESTK.me')
    assert.equal(product.sku, 'Max')
    assert.equal(product.nameplate, 'ESTK.me Max')
    assert.equal(product.dualEuicc, true)
    assert.equal(product.expectedEuiccCount, 2)
    assert.equal(chipMakerFromEid('8903302300000001'), 'Thales DIS France SAS')
  })

  it('labels ESTK COS6 + EIN 89049032 as Estk.me C beta without using leftover NVRAM', () => {
    const product = resolveEuiccProduct({
      aids: [ESTK_SE0_AID],
      eids: ['89049032'],
      firmware: '32.33.0',
      freeNvramBytesList: [999999],
    })
    assert.equal(product.nameplate, 'Estk.me C beta')
    assert.equal(product.sku, 'C beta')
    assert.equal(product.dualEuicc, false)
    assert.equal(product.expectedEuiccCount, 1)
  })

  it('does not guess Plus+ from leftover NVRAM when the EIN is still 89049032', () => {
    const product = resolveEuiccProduct({
      aids: [ESTK_SE0_AID],
      eids: ['89049032'],
      freeNvramBytesList: [700000],
    })
    assert.equal(product.nameplate, 'ESTK.me')
    assert.equal(product.sku, '')
  })

  it('labels ESTK + EIN 89034011 as Plus+', () => {
    const product = resolveEuiccProduct({
      aids: [ESTK_SE0_AID],
      eids: ['8903401100000001'],
    })
    assert.equal(product.nameplate, 'ESTK.me Plus+')
    assert.equal(product.sku, 'Plus+')
  })

  it('labels G+D SAS + GSMA ISD-R as G+D天联, not a backwards D+G nameplate', () => {
    const product = resolveEuiccProduct({
      aids: [GSMA_ISD_R_AID],
      eids: ['8904903200000001'],
      sasList: ['GD-NG-UP-1227'],
    })
    assert.equal(product.brand, 'G+D天联')
    assert.equal(product.nameplate, 'G+D天联')
    assert.equal(product.dualEuicc, false)
  })

  it('does not call an ESTK SE0 card G+D天联 even when the EIN is G+D silicon', () => {
    const product = resolveEuiccProduct({
      aids: [ESTK_SE0_AID],
      eids: ['89049032'],
      sasList: [''],
      firmware: '32.33.0',
    })
    assert.equal(product.nameplate, 'Estk.me C beta')
  })

  it('recognizes OEM-AID brands without inventing their unpaid SKU tiers', () => {
    assert.equal(resolveEuiccProduct({ aids: [XESIM_ISD_R_AID] }).nameplate, 'XeSIM')
    assert.equal(resolveEuiccProduct({ aids: [BER5_ISD_R_AID] }).nameplate, '5ber.eSIM')
    assert.equal(resolveEuiccProduct({ aids: [ESIM_ME_ISD_R_AID] }).nameplate, 'eSIM.me')
    assert.equal(resolveEuiccProduct({ aids: [LINKSFIELD_ISD_R_AID] }).nameplate, 'LinksField')
    assert.equal(resolveEuiccProduct({ eids: ['890440451234'] }).nameplate, '9eSIM')
    assert.equal(resolveEuiccProduct({ eids: ['890490441234'] }).nameplate, 'sysmoEUICC1-C2T')
  })

  it('does not guess 9eSIM V0 or Switch.eSIM from the shared Eastcompeace EIN', () => {
    const product = resolveEuiccProduct({
      aids: [GSMA_ISD_R_AID],
      eids: ['8908603000000001'],
    })
    assert.equal(product.nameplate, '')
    assert.equal(product.brand, '')
  })

  it('labels the Eastcompeace card with SAS ED-ZI-UP-0828 as 9eSIM B1', () => {
    const product = resolveEuiccProduct({
      aids: [GSMA_ISD_R_AID],
      eids: ['89086030202200000026000482382636'],
      sasList: ['ED-ZI-UP-0828'],
      firmware: '4.2.0',
    })
    assert.equal(product.nameplate, '9eSIM B1')
  })

  it('keeps the silicon maker off the retail nameplate for ESTK Max', () => {
    const rows = decorateEuiccHardware([
      {
        index: 0,
        eid: '8903302300000001',
        aidHex: ESTK_SE0_AID,
        manufacturer: 'Thales DIS France SAS',
        freeNvram: '634.55 KB',
      },
      {
        index: 1,
        eid: '8903302300000002',
        aidHex: ESTK_SE1_AID,
        manufacturer: 'Thales DIS France SAS',
        freeNvram: '684.87 KB',
      },
    ])
    assert.equal(rows[0].nameplate, 'ESTK.me Max')
    assert.equal(rows[1].nameplate, 'ESTK.me Max')
    assert.equal(rows[0].chipMaker, 'Thales DIS France SAS')
    assert.equal(rows[0].dualEuicc, true)
  })
})
