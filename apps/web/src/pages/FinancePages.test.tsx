import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CategoriesPage } from './CategoriesPage'
import { formatThbMinor } from './finance-format'
import { TransactionsPage } from './TransactionsPage'

const session = {
  csrfToken: 'fictional-csrf-token',
  user: { role: 'owner' as const, username: 'fictional-owner' },
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('finance pages', () => {
  it('renders responsive transaction semantics and opens the focused form', async () => {
    stubFinanceFetch({ categories: [], transactions: [] })
    renderPage(<TransactionsPage />)

    expect(await screen.findByText('ยังไม่มีรายการ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มรายการ' }))

    expect(
      screen.getByRole('dialog', { name: 'เพิ่มรายรับหรือรายจ่าย' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('จำนวนเงิน (บาท)')).toHaveAttribute(
      'inputmode',
      'decimal',
    )
    expect(screen.queryByText('บัตรเครดิต')).not.toBeInTheDocument()
  })

  it('opens the transaction form from the global quick-add URL', async () => {
    stubFinanceFetch({ categories: [], transactions: [] })
    renderPage(<TransactionsPage />, '/?action=new')

    expect(
      await screen.findByRole('dialog', { name: 'เพิ่มรายรับหรือรายจ่าย' }),
    ).toBeInTheDocument()
  })

  it('shows active and inactive categories without hiding history', async () => {
    stubFinanceFetch({
      categories: [
        {
          direction: 'expense',
          id: '11111111-1111-4111-8111-111111111111',
          isActive: true,
          name: 'อาหารสมมติ',
        },
        {
          direction: 'income',
          id: '22222222-2222-4222-8222-222222222222',
          isActive: false,
          name: 'รายได้เดิม',
        },
      ],
      transactions: [],
    })
    renderPage(<CategoriesPage />)

    expect(await screen.findByText('อาหารสมมติ')).toBeInTheDocument()
    expect(screen.getByText('รายได้เดิม')).toBeInTheDocument()
    expect(
      screen.getByText('ปิดใช้งาน', { selector: 'small' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'เปิดใช้งาน' }),
    ).toBeInTheDocument()
  })

  it('formats large THB minor units without floating-point conversion', () => {
    expect(formatThbMinor('99999999999')).toBe('฿999,999,999.99')
  })
})

function renderPage(page: ReactNode, initialEntry = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      {
        children: [{ element: page, index: true }],
        element: <Outlet context={{ session }} />,
        path: '/',
      },
    ],
    { initialEntries: [initialEntry] },
  )

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function stubFinanceFetch({
  categories,
  transactions,
}: {
  categories: readonly unknown[]
  transactions: readonly unknown[]
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      const body = url.includes('/api/categories')
        ? { items: categories }
        : { items: transactions, nextPage: null }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
    }),
  )
}
