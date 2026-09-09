import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'

function setup(
  path = '/',
  role: 'owner' | 'member' = 'owner',
  isSigningOut = false,
) {
  const onSignOut = vi.fn()
  const router = createMemoryRouter(
    [
      {
        element: (
          <AppShell
            session={{
              csrfToken: 'fictional',
              user: { role, username: 'sample-user' },
            }}
            isSigningOut={isSigningOut}
            onSignOut={onSignOut}
          />
        ),
        children: [{ path: '*', element: <h1>เนื้อหาทดสอบ</h1> }],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  const bottomNav = screen.getByRole('navigation', { name: 'เมนูหลักบนมือถือ' })
  const more = within(bottomNav).getByRole('button', { name: /เพิ่มเติม/ })
  more.focus()
  return { router, bottomNav, more, onSignOut }
}

describe('mobile navigation', () => {
  it('offers three primary routes plus More and restores focus after close or Escape', () => {
    const { bottomNav, more } = setup()
    expect(
      within(bottomNav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/', '/transactions', '/credit-cards'])
    expect(within(bottomNav).getAllByRole('button')).toHaveLength(1)
    expect(
      within(bottomNav).getByRole('link', { name: 'ภาพรวม' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(more).not.toHaveClass('is-active')
    for (const action of ['close', 'escape']) {
      fireEvent.click(more)
      expect(more).toHaveAttribute('aria-expanded', 'true')
      const dialog = screen.getByRole('dialog', { name: 'เพิ่มเติม' })
      const close = within(dialog).getByRole('button', {
        name: 'ปิดเมนูเพิ่มเติม',
      })
      close.focus()
      if (action === 'close') fireEvent.click(close)
      else fireEvent(dialog, new Event('cancel', { cancelable: true }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(more).toHaveFocus()
      expect(more).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it.each(['/installments', '/recurring-expenses', '/categories', '/users'])(
    'marks More for %s and preserves secondary navigation',
    (path) => {
      const { more, router } = setup(path)
      expect(more).toHaveClass('is-active')
      expect(more).toHaveAccessibleName('เพิ่มเติม — หน้าปัจจุบันอยู่ในเมนูนี้')
      fireEvent.click(more)
      const dialog = screen.getByRole('dialog', { name: 'เพิ่มเติม' })
      const links = within(dialog).getAllByRole('link')
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/installments',
        '/recurring-expenses',
        '/categories',
        '/users',
      ])
      expect(
        links.find((link) => link.getAttribute('href') === path),
      ).toHaveAttribute('aria-current', 'page')
      fireEvent.click(within(dialog).getByRole('link', { name: 'หมวดหมู่' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/categories')
      expect(more).toHaveFocus()
    },
  )

  it('hides user management from members and keeps sign-out available in Account', () => {
    const { more, onSignOut } = setup('/categories', 'member')
    fireEvent.click(more)
    const dialog = screen.getByRole('dialog', { name: 'เพิ่มเติม' })
    expect(
      screen.queryByRole('link', { name: 'ผู้ใช้' }),
    ).not.toBeInTheDocument()
    expect(within(dialog).getByText('sample-user')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'ออกจากระบบ' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('disables sign-out while the existing logout flow is pending', () => {
    const { more } = setup('/', 'member', true)
    fireEvent.click(more)
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'กำลังออก…',
      }),
    ).toBeDisabled()
  })
})

describe('desktop shell', () => {
  it.each(['owner', 'member'] as const)(
    'preserves navigation and account actions for %s',
    (role) => {
      setup('/users', role)
      const sidebar = within(screen.getByRole('complementary'))
      expect(
        sidebar.getAllByRole('link').map((link) => link.getAttribute('href')),
      ).toEqual([
        '/',
        '/',
        '/transactions',
        '/credit-cards',
        '/installments',
        '/recurring-expenses',
        '/categories',
        ...(role === 'owner' ? ['/users'] : []),
      ])
      if (role === 'owner')
        expect(sidebar.getByRole('link', { name: 'ผู้ใช้' })).toHaveAttribute(
          'aria-current',
          'page',
        )
      else
        expect(
          sidebar.queryByRole('link', { name: 'ผู้ใช้' }),
        ).not.toBeInTheDocument()
      expect(sidebar.getByRole('region', { name: 'บัญชี' })).toHaveTextContent(
        'sample-user',
      )
      expect(sidebar.getByRole('button', { name: 'ออกจากระบบ' })).toBeEnabled()
      expect(
        screen.getByRole('link', { name: 'ข้ามไปเนื้อหา' }),
      ).toHaveAttribute('href', '#main-content')
    },
  )
})
