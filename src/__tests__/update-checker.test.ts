import { beforeEach, expect, it, vi } from 'vitest'
const fetch = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  net: { fetch },
}))
import { checkForUpdate } from '../update-checker'
const prefix =
  'https://github.com/younghoandrewchaa/m-note/releases/download/v2.0.0/'
const names = [
  `M.Note-darwin-${process.arch}-2.0.0.zip`,
  `update-darwin-${process.arch}.json`,
]
beforeEach(() => {
  fetch.mockReset()
})
function release(assets = names, version = '2.0.0') {
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      tag_name: `v${version}`,
      assets: assets.map((name) => ({
        name,
        browser_download_url: prefix + name,
      })),
    }),
  })
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      url: prefix + names[0],
      name: `M Note v${version}`,
      notes: '',
      pub_date: '2026-10-18T00:00:00Z',
    }),
  })
}
it('selects a pinned native feed without a DMG', async () => {
  release()
  expect(await checkForUpdate()).toEqual({
    version: '2.0.0',
    feedUrl: prefix + names[1],
  })
})
it('rejects incomplete releases', async () => {
  release([names[1]])
  await expect(checkForUpdate()).rejects.toThrow('compatible')
})
it('rejects wrong architecture', async () => {
  release(['M.Note-darwin-other-2.0.0.zip', 'update-darwin-other.json'])
  await expect(checkForUpdate()).rejects.toThrow('compatible')
})
it('returns null only when current', async () => {
  release([], '1.0.0')
  expect(await checkForUpdate()).toBeNull()
})
it('reports network errors', async () => {
  fetch.mockRejectedValue(new Error('offline'))
  await expect(checkForUpdate()).rejects.toThrow('offline')
})
it('reports HTTP failure', async () => {
  fetch.mockResolvedValue({ ok: false, status: 503 })
  await expect(checkForUpdate()).rejects.toThrow('503')
})
it('rejects a feed pointing at a different binary', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      tag_name: 'v2.0.0',
      assets: names.map((name) => ({
        name,
        browser_download_url: prefix + name,
      })),
    }),
  })
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      url: 'https://example.com/wrong.zip',
      name: 'M Note v2.0.0',
      notes: '',
      pub_date: '2026-10-18T00:00:00Z',
    }),
  })
  await expect(checkForUpdate()).rejects.toThrow('metadata')
})
