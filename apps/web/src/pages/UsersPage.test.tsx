import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UsersPage } from './UsersPage'

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Person',
  username: 'example-person',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderUsers(role: 'owner' | 'member' = 'owner') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter([
    {
      element: (
        <Outlet
          context={{
            session: {
              csrfToken: 'example-csrf',
              user: { role, username: 'example-owner' },
            },
          }}
        />
      ),
      children: [{ index: true, element: <UsersPage /> }],
    },
  ])
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('user management', () => {
  it('does not request account data for members', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    renderUsers('member')
    expect(
      screen.getByText('เฉพาะเจ้าของบัญชีเท่านั้นที่จัดการผู้ใช้ได้'),
    ).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('creates with only the requested fields and clears the password after success', async () => {
    const fetch = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(init?.method === 'POST' ? user : { items: [user] }),
      }),
    )
    vi.stubGlobal('fetch', fetch)
    renderUsers()
    expect(await screen.findByText('Example Person')).toBeInTheDocument()
    const add = screen.getByRole('button', { name: 'เพิ่มผู้ใช้' })
    add.focus()
    fireEvent.click(add)
    expect(
      screen.getByRole('dialog', { name: 'เพิ่มผู้ใช้' }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ชื่อ'), {
      target: { value: 'New Person' },
    })
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'new-person' },
    })
    const password = screen.getByLabelText('Password')
    fireEvent.change(password, { target: { value: 'fictional-password-1234' } })
    fireEvent.submit(
      screen.getByRole('button', { name: 'บันทึกผู้ใช้' }).closest('form')!,
    )
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'New Person',
            username: 'new-person',
            password: 'fictional-password-1234',
          }),
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': 'example-csrf',
          },
        }),
      ),
    )
    expect(await screen.findByText('บันทึกผู้ใช้แล้ว')).toBeInTheDocument()
    expect(password).toHaveValue('')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(add).toHaveFocus()
  })

  it('edits without sending a blank password and keeps input on a server error', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    const fetch = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: init?.method !== 'PATCH',
        json: () =>
          Promise.resolve(
            init?.method === 'PATCH'
              ? { error: { message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' } }
              : { items: [user] },
          ),
      }),
    )
    vi.stubGlobal('fetch', fetch)
    renderUsers()
    fireEvent.click(
      await screen.findByRole('button', { name: 'แก้ไข Example Person' }),
    )
    expect(screen.getByLabelText('Password ใหม่')).toHaveValue('')
    expect(screen.getByLabelText('Password ใหม่')).toHaveAccessibleDescription(
      'เว้นว่างเพื่อใช้รหัสผ่านเดิม หากเปลี่ยน ผู้ใช้นี้ต้องเข้าสู่ระบบใหม่',
    )
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'taken-name' },
    })
    fireEvent.submit(
      screen.getByRole('button', { name: 'บันทึกผู้ใช้' }).closest('form')!,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ชื่อผู้ใช้นี้มีอยู่แล้ว',
    )
    expect(screen.getByLabelText('Username')).toHaveValue('taken-name')
    expect(fetch).toHaveBeenCalledWith(
      `/api/users/${user.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: user.name, username: 'taken-name' }),
      }),
    )
  })

  it('reports validation errors as alerts without exposing the password', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [user] }),
      }),
    )
    vi.stubGlobal('fetch', fetch)
    renderUsers()
    await screen.findByText('Example Person')
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ใช้' }))
    fireEvent.change(screen.getByLabelText('ชื่อ'), {
      target: { value: 'Example' },
    })
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'ab' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'fictional-password-1234' },
    })
    fireEvent.submit(
      screen.getByRole('button', { name: 'บันทึกผู้ใช้' }).closest('form')!,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'กรุณาระบุชื่อและชื่อผู้ใช้อย่างน้อย 3 ตัวอักษร',
    )
    expect(
      screen.queryByText('fictional-password-1234'),
    ).not.toBeInTheDocument()
  })
})
