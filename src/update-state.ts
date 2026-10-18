export type UpdateState = { revision: number } & (
  | { status: 'idle' | 'checking' | 'up-to-date' | 'unsupported' }
  | { status: 'downloading' | 'ready' | 'installing'; version: string }
  | { status: 'error'; message: string; retryable: boolean }
)
export type InstallResult = {
  status: 'installing' | 'cancelled' | 'error'
  message?: string
}
