import { app, net } from 'electron'
const BASE = 'https://github.com/younghoandrewchaa/m-note/releases/download'
export interface UpdateInfo {
  version: string
  feedUrl: string
}
function versionParts(version: string): number[] {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Invalid update version.')
  return version.split('.').map(Number)
}
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const response = await net.fetch(
    'https://api.github.com/repos/younghoandrewchaa/m-note/releases/latest',
    { headers: { Accept: 'application/vnd.github+json' } },
  )
  if (!response.ok)
    throw new Error(
      `Unable to check for updates (${response.status}). Please retry.`,
    )
  const release = (await response.json()) as {
    tag_name: string
    assets: { name: string; browser_download_url: string }[]
  }
  const version = release.tag_name.replace(/^v/, '')
  const latest = versionParts(version),
    current = versionParts(app.getVersion())
  const difference =
    latest.map((n, i) => n - current[i]).find((n) => n !== 0) ?? 0
  if (difference <= 0) return null
  const feedName = `update-darwin-${process.arch}.json`
  const zip = release.assets.find((asset) =>
    asset.name.endsWith(`-darwin-${process.arch}-${version}.zip`),
  )
  const feed = release.assets.find((asset) => asset.name === feedName)
  const prefix = `${BASE}/${encodeURIComponent(release.tag_name)}/`
  if (
    process.platform !== 'darwin' ||
    !zip ||
    !feed ||
    feed.browser_download_url !== prefix + feedName ||
    !zip.browser_download_url.startsWith(prefix)
  ) {
    throw new Error(
      'A compatible update is not available yet. Please retry later.',
    )
  }
  const feedResponse = await net.fetch(feed.browser_download_url)
  if (!feedResponse.ok)
    throw new Error('Unable to load update metadata. Please retry.')
  const metadata = (await feedResponse.json()) as {
    url?: string
    name?: string
    notes?: string
    pub_date?: string
  }
  if (
    metadata.url !== zip.browser_download_url ||
    typeof metadata.name !== 'string' ||
    !metadata.name.includes(version) ||
    typeof metadata.notes !== 'string' ||
    !Number.isFinite(Date.parse(metadata.pub_date ?? ''))
  ) {
    throw new Error('Invalid update metadata. Please retry later.')
  }
  return { version, feedUrl: feed.browser_download_url }
}
