import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(document.querySelector('.brand-mark .bi-wallet2')).not.toBeNull()
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

  it('preserves remember-me submission and generic authentication errors', async () => {
    const onSubmit = vi.fn()
    render(
      <LoginPage
        errorMessage="ไม่สามารถเข้าสู่ระบบได้"
        isSubmitting={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), {
      target: { value: ' example-user ' },
    })
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), {
      target: { value: 'fictional-password' },
    })
    fireEvent.click(screen.getByLabelText('จดจำการเข้าสู่ระบบ 7 วัน'))
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          password: 'fictional-password',
          rememberMe: true,
          username: 'example-user',
        },
        expect.anything(),
      ),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'ไม่สามารถเข้าสู่ระบบได้',
    )
    expect(
      screen.queryByText(/สมัครสมาชิก|ลืมรหัสผ่าน/),
    ).not.toBeInTheDocument()
  })
})
