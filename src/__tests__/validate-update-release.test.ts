import { expect, it } from 'vitest'
import { validateUpdateRelease } from '../../scripts/validate-update-release.mjs'
const zip = 'M.Note-darwin-arm64-2.0.0.zip'
const input = {
  version: '2.0.0',
  arch: 'arm64',
  assets: [
    zip,
    'update-darwin-arm64.json',
    'update.json',
    'RELEASES.json',
    'M.Note.dmg',
  ],
  feed: {
    url: `https://github.com/younghoandrewchaa/m-note/releases/download/v2.0.0/${zip}`,
    name: 'M Note v2.0.0',
    notes: '',
    pub_date: '2026-10-18T00:00:00Z',
  },
}
it('accepts a complete pinned update', () =>
  expect(() => validateUpdateRelease(input)).not.toThrow())
it('rejects missing zip', () =>
  expect(() =>
    validateUpdateRelease({ ...input, assets: input.assets.slice(1) }),
  ).toThrow())
it('rejects incompatible architecture', () =>
  expect(() => validateUpdateRelease({ ...input, arch: 'x64' })).toThrow())
it('rejects a moving feed URL', () =>
  expect(() =>
    validateUpdateRelease({
      ...input,
      feed: {
        ...input.feed,
        url: input.feed.url.replace('download/v2.0.0', 'latest/download'),
      },
    }),
  ).toThrow())
it('rejects missing required metadata', () =>
  expect(() =>
    validateUpdateRelease({ ...input, feed: { url: input.feed.url } }),
  ).toThrow())

import { validateSigningIdentity } from '../../scripts/validate-update-release.mjs'
it('rejects a valid signature from the wrong team', () => {
  expect(() =>
    validateSigningIdentity('OTHERTEAM', 'com.electron.m-note'),
  ).toThrow('identity')
})
it('rejects a different bundle identity', () => {
  expect(() =>
    validateSigningIdentity('G569HDEERH', 'com.example.other'),
  ).toThrow('identity')
})
it('accepts the established app signing identity', () => {
  expect(() =>
    validateSigningIdentity('G569HDEERH', 'com.electron.m-note'),
  ).not.toThrow()
})
