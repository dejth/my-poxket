import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Modal } from './Modal'

describe('native modal lifecycle', () => {
  it('uses native modality, handles cancel, and restores its opener', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    function Example() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>เปิด</button>
          {open ? (
            <Modal labelledBy="test-title" onClose={() => setOpen(false)}>
              <h2 id="test-title">ทดสอบ</h2>
              <input aria-label="ข้อมูล" />
            </Modal>
          ) : null}
        </>
      )
    }
    render(<Example />)
    const opener = screen.getByRole('button', { name: 'เปิด' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'ทดสอบ' })
    expect(showModal).toHaveBeenCalledOnce()
    screen.getByLabelText('ข้อมูล').focus()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    showModal.mockRestore()
  })
})
