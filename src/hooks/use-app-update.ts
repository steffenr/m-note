import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '../update-state'
export function newerUpdateState(
  current: UpdateState,
  incoming: UpdateState,
): UpdateState {
  return incoming.revision > current.revision ? incoming : current
}
export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>({
    status: 'idle',
    revision: -1,
  })
  const accept = useCallback(
    (incoming: UpdateState) =>
      setState((current) => newerUpdateState(current, incoming)),
    [],
  )
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    let active = true
    const receive = (next: UpdateState) => {
      if (active) accept(next)
    }
    const unsubscribe = api.onUpdateStateChanged(receive)
    void api.getUpdateState().then(receive)
    return () => {
      active = false
      unsubscribe()
    }
  }, [accept])
  const check = useCallback(async () => {
    if (window.electronAPI) accept(await window.electronAPI.checkForUpdate())
  }, [accept])
  const install = useCallback(async () => {
    await window.electronAPI?.installUpdate()
  }, [])
  return { state, check, install }
}
