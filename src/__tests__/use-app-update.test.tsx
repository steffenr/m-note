// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useAppUpdate } from '../hooks/use-app-update'
import type { UpdateState } from '../update-state'
it('subscribes before its snapshot and does not check on window mount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let listener!: (state: UpdateState) => void
  let resolveSnapshot!: (state: UpdateState) => void
  const unsubscribe = vi.fn()
  const api = {
    onUpdateStateChanged: vi.fn((fn: typeof listener) => { listener = fn; return unsubscribe }),
    getUpdateState: vi.fn(() => new Promise<UpdateState>(r => { resolveSnapshot = r })),
    checkForUpdate: vi.fn().mockResolvedValue({ status: 'up-to-date', revision: 5 }),
    installUpdate: vi.fn(),
  }
  window.electronAPI = api as unknown as ElectronAPI
  function View() { const { state, check } = useAppUpdate(); return <button onClick={check}>{state.status}</button> }
  const host = document.createElement('div'), root = createRoot(host)
  await act(async () => root.render(<View />))
  expect(api.checkForUpdate).not.toHaveBeenCalled()
  expect(api.onUpdateStateChanged.mock.invocationCallOrder[0]).toBeLessThan(api.getUpdateState.mock.invocationCallOrder[0])
  act(() => listener({ status: 'ready', version: '2.0.0', revision: 3 }))
  await act(async () => resolveSnapshot({ status: 'checking', revision: 1 }))
  expect(host.textContent).toBe('ready')
  await act(async () => host.querySelector('button')!.click())
  expect(api.checkForUpdate).toHaveBeenCalledOnce()
  expect(host.textContent).toBe('up-to-date')
  act(() => root.unmount())
  expect(unsubscribe).toHaveBeenCalledOnce()
  vi.unstubAllGlobals()
})
