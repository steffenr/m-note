import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
// Preserve the identity of the existing signed M Note installation.
export function validateSigningIdentity(team, bundleId) {
  if (team !== 'G569HDEERH' || bundleId !== 'com.electron.m-note') {
    throw new Error('Signing identity does not match the installed M Note app')
  }
}
export function validateUpdateRelease({ version, arch, assets, feed }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !['arm64', 'x64'].includes(arch))
    throw new Error('Invalid release version or architecture')
  const zip = assets.find((name) =>
    name.endsWith(`-darwin-${arch}-${version}.zip`),
  )
  for (const name of [
    'update.json',
    `update-darwin-${arch}.json`,
    'RELEASES.json',
  ]) {
    if (!assets.includes(name)) throw new Error(`Missing ${name}`)
  }
  if (!zip || !assets.some((name) => name.endsWith('.dmg')))
    throw new Error('Missing release binary')
  if (
    feed.url !==
    `https://github.com/younghoandrewchaa/m-note/releases/download/v${version}/${zip}`
  )
    throw new Error('Update URL does not match this release and architecture')
  if (
    typeof feed.name !== 'string' ||
    !feed.name.includes(version) ||
    typeof feed.notes !== 'string' ||
    !Number.isFinite(Date.parse(feed.pub_date))
  )
    throw new Error('Invalid update metadata')
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [directory, version, arch, team, bundleId] = process.argv.slice(2)
  const assets = fs.readdirSync(directory)
  const feed = JSON.parse(
    fs.readFileSync(path.join(directory, `update-darwin-${arch}.json`), 'utf8'),
  )
  validateUpdateRelease({ version, arch, assets, feed })
  if (team !== undefined || bundleId !== undefined)
    validateSigningIdentity(team, bundleId)
  console.log(`Validated v${version} (${arch})`)
}
