import { type Dispatch, type SetStateAction, useEffect } from 'react'

import { Icon } from './Icon'

export function ActionNotice({
  message,
  setMessage,
}: {
  readonly message: string | null
  readonly setMessage: Dispatch<SetStateAction<string | null>>
}) {
  useEffect(() => {
    if (!message) return
    const timeoutId = window.setTimeout(() => setMessage(null), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [message, setMessage])

  return message ? (
    <div className="action-notice" role="status">
      <span>{message}</span>
      <button
        aria-label="ปิดข้อความ"
        onClick={() => setMessage(null)}
        type="button"
      >
        <Icon name="x-lg" />
      </button>
    </div>
  ) : null
}
