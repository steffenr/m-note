import { useEffect, useState } from 'react'
import type { UpdateState } from '../update-state'
export const UP_TO_DATE_BANNER_MS = 3000
export function UpdateBanner({
  state,
  check,
  install,
}: {
  state: UpdateState
  check: () => void
  install: () => void
}) {
  const [dismissedRevision, setDismissedRevision] = useState<number>()
  useEffect(() => {
    if (state.status !== 'up-to-date') return
    const timer = setTimeout(
      () => setDismissedRevision(state.revision),
      UP_TO_DATE_BANNER_MS,
    )
    return () => clearTimeout(timer)
  }, [state.status, state.revision])
  if (state.status === 'idle' || state.status === 'unsupported') return null
  if (state.status === 'up-to-date' && dismissedRevision === state.revision)
    return null
  const text =
    state.status === 'checking'
      ? 'Checking for updates…'
      : state.status === 'downloading'
        ? `Downloading M Note v${state.version}…`
        : state.status === 'ready'
          ? `M Note v${state.version} is ready to install.`
          : state.status === 'installing'
            ? 'Installing update…'
            : state.status === 'up-to-date'
              ? "You're up to date."
              : state.status === 'error'
                ? state.message
                : null
  return (
    <div className="update-banner" role="status">
      <span>{text}</span>
      {state.status === 'ready' && (
        <button className="update-banner-link" onClick={install}>
          Restart &amp; Install
        </button>
      )}
      {state.status === 'error' && state.retryable && (
        <button className="update-banner-link" onClick={check}>
          Retry
        </button>
      )}
    </div>
  )
}
