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

const px = value => ({ value, unit: 'px' })
const design = {
  fontBody: ['Inter', 'system-ui'], fontDisplay: ['Inter', 'system-ui'],
  fontBodySize: px(14), fontSmallSize: px(12), fontHeadingSize: px(24),
  fontBodyWeight: 400, fontHeadingWeight: 600,
  lineHeightBody: 1.5, lineHeightHeading: 1.25,
  spaceXs: px(4), spaceSm: px(8), spaceMd: px(12), spaceLg: px(20), spaceXl: px(32),
  radiusControl: px(4), radiusCard: px(6), radiusDialog: px(8), borderWidth: px(1),
  shadowCard: { color: '#53636a', offsetX: px(0), offsetY: px(2), blur: px(12), spread: px(0) },
  shadowPopup: { color: '#53636a', offsetX: px(0), offsetY: px(6), blur: px(24), spread: px(0) },
  controlHeight: px(36), iconSize: px(24), sidebarWidth: px(280), contentMaxWidth: px(1200),
  pageGutter: px(16), breakpointMobile: px(640), breakpointTablet: px(1024),
  layoutTemplate: 'centered', homeColumns: 4,
}

const designTypes = Object.fromEntries(Object.entries(design).map(([name, value]) => [name,
  name.startsWith('font') && (name === 'fontBody' || name === 'fontDisplay') ? 'fontFamily'
    : name.endsWith('Weight') ? 'fontWeight'
      : name.startsWith('lineHeight') || name === 'homeColumns' ? 'number'
        : name.startsWith('shadow') ? 'shadow'
          : name === 'layoutTemplate' ? 'string' : 'dimension']))

export function createThemeArchive({
  id = 'test.e2e.theme',
  name = 'E2E Theme',
  version = '1.0.0',
  schemes = ['light', 'dark'],
  assetContent = 'e2e-theme-asset-v1',
  invalidDtcgVersion = false,
  colorVariant = 'default',
  apiVersion = '1',
  designValues = {},
  wallpapers = undefined,
  extraResources = [],
} = {}) {
  const documents = Object.fromEntries(schemes.map((scheme) => {
    const palette = { ...palettes[scheme] }
    if (colorVariant === 'blue' && scheme === 'light') palette.primary = '#064b79'
    const colors = Object.fromEntries(Object.entries(palette).map(([slot, value]) => [slot, { $value: value }]))
    return [scheme, strToU8(JSON.stringify({
      $schema: 'https://design-tokens.github.io/community-group/format/2025.10/schema.json',
      color: { $type: 'color', ...colors },
      ...(apiVersion === '2' ? { design: Object.fromEntries(Object.entries({ ...design, ...designValues }).map(([name, value]) => [name, { $type: designTypes[name], $value: value }])) } : {}),
    }))]
  }))
  const asset = strToU8(assetContent)
  const resources = [
    { path: 'assets/logo.png', mediaType: 'image/png', content: asset },
    ...extraResources,
  ]
  const manifest = {
    format: 'yin-theme',
    formatVersion: 1,
    id,
    name,
    packageVersion: version,
    apiVersion,
    dtcgVersion: invalidDtcgVersion ? '2025.09' : '2025.10',
    schemes,
    documents: Object.fromEntries(schemes.map(scheme => [scheme, `tokens/${scheme}.json`])),
    bindings: {
      ...Object.fromEntries(slots.map(slot => [slot, `/color/${slot}`])),
      ...(apiVersion === '2' ? Object.fromEntries(Object.keys(design).map(slot => [slot, `/design/${slot}`])) : {}),
    },
    resources: resources.map(resource => ({ path: resource.path, mediaType: resource.mediaType, sha256: crypto.createHash('sha256').update(resource.content).digest('hex') })),
    ...(wallpapers ? { wallpapers } : {}),
  }
  const files = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    ...Object.fromEntries(resources.map(resource => [resource.path, resource.content])),
    ...Object.fromEntries(Object.entries(documents).map(([scheme, document]) => [`tokens/${scheme}.json`, document])),
  }
  return Buffer.from(zipSync(files, { level: 6 }))
}
