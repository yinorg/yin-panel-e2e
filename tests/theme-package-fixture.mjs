import crypto from 'node:crypto'
import { strToU8, zipSync } from 'fflate'

const palettes = {
  light: {
    canvas: '#eff7ff', surface: '#f3f6f8', surfaceElevated: '#ffffff', text: '#172126',
    textMuted: '#53636a', border: '#d5dfe2', primary: '#075b68', onPrimary: '#ffffff',
    secondary: '#8b4412', success: '#176b45', warning: '#805200', danger: '#a12627', focusRing: '{color.primary}',
  },
  dark: {
    canvas: '#171d20', surface: '#222a2e', surfaceElevated: '#2b353a', text: '#f1f5f6',
    textMuted: '#b0bec3', border: '#536168', primary: '#72d6df', onPrimary: '#102326',
    secondary: '#f0a66d', success: '#71d8a0', warning: '#f2c46c', danger: '#ff9792', focusRing: '{color.primary}',
  },
}

const slots = Object.keys(palettes.light)

export function createThemeArchive({
  id = 'test.e2e.theme',
  name = 'E2E Theme',
  version = '1.0.0',
  schemes = ['light', 'dark'],
  assetContent = 'e2e-theme-asset-v1',
  invalidDtcgVersion = false,
  colorVariant = 'default',
} = {}) {
  const documents = Object.fromEntries(schemes.map((scheme) => {
    const palette = { ...palettes[scheme] }
    if (colorVariant === 'blue' && scheme === 'light') palette.primary = '#064b79'
    const colors = Object.fromEntries(Object.entries(palette).map(([slot, value]) => [slot, { $value: value }]))
    return [scheme, strToU8(JSON.stringify({
      $schema: 'https://design-tokens.github.io/community-group/format/2025.10/schema.json',
      color: { $type: 'color', ...colors },
    }))]
  }))
  const asset = strToU8(assetContent)
  const manifest = {
    format: 'yin-theme',
    formatVersion: 1,
    id,
    name,
    packageVersion: version,
    apiVersion: '1',
    dtcgVersion: invalidDtcgVersion ? '2025.09' : '2025.10',
    schemes,
    documents: Object.fromEntries(schemes.map(scheme => [scheme, `tokens/${scheme}.json`])),
    bindings: Object.fromEntries(slots.map(slot => [slot, `/color/${slot}`])),
    resources: [{
      path: 'assets/logo.png',
      sha256: crypto.createHash('sha256').update(asset).digest('hex'),
      mediaType: 'image/png',
    }],
  }
  const files = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'assets/logo.png': asset,
    ...Object.fromEntries(Object.entries(documents).map(([scheme, document]) => [`tokens/${scheme}.json`, document])),
  }
  return Buffer.from(zipSync(files, { level: 6 }))
}
