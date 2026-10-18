import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  feed: vi.fn(),
  install: vi.fn(),
  lookup: vi.fn(),
  listeners: {} as Record<string, (...args: unknown[]) => void>,
}))
vi.mock('electron', () => ({
  autoUpdater: {
    on: (name: string, fn: (...args: unknown[]) => void) => {
      mocks.listeners[name] = fn
    },
    setFeedURL: mocks.feed,
    checkForUpdates: mocks.check,
    quitAndInstall: mocks.install,
  },
}))
vi.mock('../update-checker', () => ({ checkForUpdate: mocks.lookup }))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.lookup.mockResolvedValue({
    version: '2.0.0',
    feedUrl: 'https://example.com/update.json',
  })
})
async function setup() {
  const updater = await import('../auto-updater')
  updater.configureAutoUpdater({ isPackaged: true, notifyRenderer: vi.fn() })
  return updater
}
it('downloads once for overlapping checks and preserves ready state', async () => {
  const u = await setup()
  await Promise.all([u.checkForNativeUpdate(), u.checkForNativeUpdate()])
  expect(mocks.check).toHaveBeenCalledTimes(1)
  expect(u.getUpdateState().status).toBe('downloading')
  mocks.listeners['update-downloaded']()
  expect((await u.checkForNativeUpdate()).status).toBe('ready')
  expect(mocks.check).toHaveBeenCalledTimes(1)
})
it('allows retry after native failure', async () => {
  const u = await setup()
  await u.checkForNativeUpdate()
  mocks.listeners.error(new Error('offline'))
  expect(u.getUpdateState().status).toBe('error')
  await u.checkForNativeUpdate()
  expect(mocks.check).toHaveBeenCalledTimes(2)
})
it('distinguishes lookup failures from up to date', async () => {
  const u = await setup()
  mocks.lookup.mockRejectedValueOnce(new Error('offline'))
  expect((await u.checkForNativeUpdate()).status).toBe('error')
  mocks.lookup.mockResolvedValueOnce(null)
  expect((await u.checkForNativeUpdate()).status).toBe('up-to-date')
})
it('retries synchronous native failures', async () => {
  const u = await setup()
  mocks.check.mockImplementationOnce(() => {
    throw new Error('failed')
  })
  expect((await u.checkForNativeUpdate()).status).toBe('error')
  expect((await u.checkForNativeUpdate()).status).toBe('downloading')
})
it('does not install without a downloaded update', async () => {
  const u = await setup()
  expect((await u.installNativeUpdate()).status).toBe('error')
  expect(mocks.install).not.toHaveBeenCalled()
})
it('returns ready after a cancelled preparation and permits another attempt', async () => {
  const u = await setup()
  const prepare = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
  u.configureAutoUpdater({
    isPackaged: true,
    notifyRenderer: vi.fn(),
    prepareInstall: prepare,
  })
  await u.checkForNativeUpdate()
  mocks.listeners['update-downloaded']()
  expect((await u.installNativeUpdate()).status).toBe('cancelled')
  expect(u.getUpdateState().status).toBe('ready')
  expect((await u.installNativeUpdate()).status).toBe('installing')
  expect(mocks.install).toHaveBeenCalledTimes(1)
})
it('prevents double installation while preparing windows', async () => {
  const u = await setup()
  let resolve!: (value: boolean) => void
  u.configureAutoUpdater({
    isPackaged: true,
    notifyRenderer: vi.fn(),
    prepareInstall: () =>
      new Promise((r) => {
        resolve = r
      }),
  })
  await u.checkForNativeUpdate()
  mocks.listeners['update-downloaded']()
  const first = u.installNativeUpdate()
  expect((await u.installNativeUpdate()).status).toBe('error')
  resolve(true)
  await first
  expect(mocks.install).toHaveBeenCalledTimes(1)
})
it('makes another check possible after update-not-available', async () => {
  const u = await setup()
  await u.checkForNativeUpdate()
  mocks.listeners['update-not-available']()
  expect(u.getUpdateState().status).toBe('up-to-date')
  await u.checkForNativeUpdate()
  expect(mocks.check).toHaveBeenCalledTimes(2)
})
