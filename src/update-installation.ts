import { BrowserWindow } from 'electron'
import {
  approveWindowClose,
  prepareWindowForClose,
  resetWindowClose,
  setWindowFrozen,
} from './window-close-handler'
export async function restoreUpdateWindows(
  windows = BrowserWindow.getAllWindows(),
): Promise<void> {
  await Promise.all(
    windows
      .filter((w) => !w.isDestroyed())
      .map(async (w) => {
        resetWindowClose(w)
        await setWindowFrozen(w, false).catch(() => undefined)
      }),
  )
}
export async function prepareWindowsForUpdate(
  windows: BrowserWindow[],
  getWindows = () => BrowserWindow.getAllWindows(),
): Promise<boolean> {
  let ready = false
  try {
    await Promise.all(windows.map((w) => setWindowFrozen(w, true)))
    for (const window of windows) {
      if (window.isDestroyed() || !(await prepareWindowForClose(window)))
        return false
    }
    const current = getWindows()
    if (
      current.length !== windows.length ||
      current.some((w) => !windows.includes(w))
    )
      return false
    windows.forEach(approveWindowClose)
    ready = true
    return true
  } finally {
    if (!ready) await restoreUpdateWindows(windows)
  }
}
