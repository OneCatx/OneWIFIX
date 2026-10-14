import { isIsoCountryCode, normalizeCountryCode } from './countryRegistry.js'
import { guessCountryCode } from './countryNodes.js'

function readAuthoritativeCountry(source) {
  if (source == null || source === '') return ''
  const text = String(source).trim()
  if (!text) return ''
  if (isIsoCountryCode(text)) return normalizeCountryCode(text)
  const guessed = guessCountryCode(text)
  return guessed === 'GLOBAL' ? '' : guessed
}

export function resolveDeviceCountryCode(device) {
  const sources = [
    device?.sim?.home_carrier_country_code,
    device?.sim?.operator_country_code,
    device?.sim?.country,
    device?.modem?.home_carrier_country_code,
    device?.modem?.operator_country_code,
    device?.egress?.detected_country,
    device?.egress?.country,
    device?.country,
  ]
  for (const source of sources) {
    const code = readAuthoritativeCountry(source)
    if (code) return code
  }
  return 'GLOBAL'
}
