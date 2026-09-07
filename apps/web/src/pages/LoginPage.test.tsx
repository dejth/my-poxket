import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('keeps the sign-in surface concise', () => {
    render(
      <LoginPage
        errorMessage={undefined}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('My Poxket')).toBeInTheDocument()
    expect(screen.getByText('พื้นที่การเงินส่วนตัวของคุณ')).toBeInTheDocument()
    expect(screen.queryByText('THB · 2 ตำแหน่ง')).not.toBeInTheDocument()
    expect(screen.queryByText('Asia/Bangkok')).not.toBeInTheDocument()
  })

  it('shows code-backed validation without submitting blank credentials', async () => {
    const onSubmit = vi.fn()
    render(
      <LoginPage
        errorMessage={undefined}
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))

    expect(
      await screen.findByText('ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร'),
    ).toBeInTheDocument()
    expect(screen.getByText('กรุณากรอกรหัสผ่าน')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
