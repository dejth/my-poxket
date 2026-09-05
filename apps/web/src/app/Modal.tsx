import { type ReactNode, useEffect, useRef } from 'react'

export function Modal({
  children,
  labelledBy,
  onClose,
  payment = false,
}: {
  readonly children: ReactNode
  readonly labelledBy: string
  readonly onClose: () => void
  readonly payment?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog
      aria-labelledby={labelledBy}
      className={`modal-frame${payment ? ' payment-dialog-backdrop' : ''}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      ref={ref}
    >
      {children}
    </dialog>
  )
}
