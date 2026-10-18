import type { UpdateState } from '../update-state'
export function UpdateBanner({
  state,
  check,
  install,
}: {
  state: UpdateState
  check: () => void
  install: () => void
}) {
  if (state.status === 'idle') return null
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
                : 'Automatic updates are available in the installed macOS app.'
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
