import { autoUpdater } from 'electron'
import { checkForUpdate } from './update-checker'
import type { InstallResult, UpdateState } from './update-state'

let state: UpdateState = { status: 'idle', revision: 0 }
let configured = false
let notify: (
  channel: 'update-state-changed',
  state: UpdateState,
) => void = () => undefined
let checking: Promise<UpdateState> | undefined
let preparing = false
let prepare: () => Promise<boolean> = async () => true
let restore: () => void = () => undefined
export const getUpdateState = (): UpdateState => state
export const isInstallingUpdate = () => state.status === 'installing'
type Transition = UpdateState extends infer S
  ? S extends UpdateState
    ? Omit<S, 'revision'>
    : never
  : never
function transition(next: Transition) {
  state = { ...next, revision: state.revision + 1 }
  notify('update-state-changed', state)
}
function fail(error: unknown) {
  transition({
    status: 'error',
    message:
      error instanceof Error ? error.message : 'Update failed. Please retry.',
    retryable: true,
  })
}
export function configureAutoUpdater(options: {
  isPackaged: boolean
  notifyRenderer: typeof notify
  prepareInstall?: () => Promise<boolean>
  restoreWindows?: () => void
}): boolean {
  notify = options.notifyRenderer
  prepare = options.prepareInstall ?? prepare
  restore = options.restoreWindows ?? restore
  if (configured) return true
  if (process.platform !== 'darwin' || !options.isPackaged) {
    transition({ status: 'unsupported' })
    return false
  }
  autoUpdater.on('update-downloaded', () => {
    if (state.status === 'downloading')
      transition({ status: 'ready', version: state.version })
  })
  autoUpdater.on('update-not-available', () => {
    if (state.status === 'downloading') transition({ status: 'up-to-date' })
  })
  autoUpdater.on('error', (error) => {
    restore()
    fail(error)
  })
  configured = true
  return true
}
export async function checkForNativeUpdate(): Promise<UpdateState> {
  if (
    !configured ||
    preparing ||
    ['downloading', 'ready', 'installing'].includes(state.status)
  )
    return state
  if (checking) return checking
  transition({ status: 'checking' })
  checking = (async () => {
    try {
      const release = await checkForUpdate()
      if (!release) {
        transition({ status: 'up-to-date' })
        return state
      }
      autoUpdater.setFeedURL({ url: release.feedUrl, serverType: 'json' })
      transition({ status: 'downloading', version: release.version })
      autoUpdater.checkForUpdates()
    } catch (error) {
      fail(error)
    }
    return state
  })()
  try {
    return await checking
  } finally {
    checking = undefined
  }
}
export async function installNativeUpdate(): Promise<InstallResult> {
  if (state.status !== 'ready' || preparing)
    return { status: 'error', message: 'No update is ready to install.' }
  preparing = true
  const version = state.version
  try {
    if (!(await prepare())) return { status: 'cancelled' }
    transition({ status: 'installing', version })
    autoUpdater.quitAndInstall()
    const latest = getUpdateState()
    return latest.status === 'error'
      ? { status: 'error', message: latest.message }
      : { status: 'installing' }
  } catch (error) {
    restore()
    fail(error)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Installation failed.',
    }
  } finally {
    preparing = false
  }
}
