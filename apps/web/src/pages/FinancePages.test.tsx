import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CategoriesPage } from './CategoriesPage'
import { CreditCardsPage } from './CreditCardsPage'
import { formatThbMinor } from './finance-format'
import { InstallmentsPage } from './InstallmentsPage'
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
    stubFinanceFetch({
      cards: [fictionalCard],
      categories: [],
      transactions: [],
    })
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
    fireEvent.change(screen.getAllByLabelText('วิธีชำระ')[1]!, {
      target: { value: 'credit_card' },
    })
    expect(screen.getAllByLabelText('บัตรเครดิต')).toHaveLength(2)
    expect(
      screen.getAllByRole('option', { name: 'บัตรตัวอย่าง •••• 1234' }),
    ).toHaveLength(2)
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

  it('shows card rules and keeps official and planned payment dates distinct', async () => {
    stubFinanceFetch({
      cards: [fictionalCard],
      categories: [],
      statements: [
        {
          amountMinor: '70000',
          cardId: fictionalCard.id,
          cardName: fictionalCard.name,
          maskedSuffix: fictionalCard.maskedSuffix,
          officialDueDate: '2026-10-01',
          plannedPaymentDate: '2026-09-30',
          purchaseCount: 1,
          statementEndDate: '2026-09-17',
        },
      ],
      transactions: [],
    })
    renderPage(<CreditCardsPage />)

    expect(
      await screen.findByText('สรุปวันที่ 17 · ครบกำหนดวันที่ 1 · ใช้งานอยู่'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('1 ต.ค. 2569')).toHaveLength(2)
    expect(screen.getAllByText('30 ก.ย. 2569')).toHaveLength(2)
    expect(screen.getAllByText('฿700.00')).toHaveLength(2)
  })

  it('previews the installment end date and shows current paid state', async () => {
    stubFinanceFetch({
      categories: [
        {
          direction: 'expense',
          id: '11111111-1111-4111-8111-111111111111',
          isActive: true,
          name: 'ผ่อนชำระสมมติ',
        },
      ],
      plans: [
        {
          categoryId: '11111111-1111-4111-8111-111111111111',
          categoryName: 'ผ่อนชำระสมมติ',
          createdAt: '2026-09-03T00:00:00.000Z',
          creditCardId: null,
          creditCardMaskedSuffix: null,
          creditCardName: null,
          description: 'เงินกู้ตัวอย่าง',
          endDate: '2026-10-05',
          firstPaymentDate: '2026-09-05',
          id: '44444444-4444-4444-8444-444444444444',
          occurrences: [
            {
              amountMinor: '50000',
              closesPlan: false,
              dueDate: '2026-09-05',
              id: '55555555-5555-4555-8555-555555555555',
              installmentNumber: 1,
              paidAmountMinor: '52500',
              paidDate: '2026-09-05',
              status: 'paid',
            },
            {
              amountMinor: '50000',
              closesPlan: false,
              dueDate: '2026-10-05',
              id: '66666666-6666-4666-8666-666666666666',
              installmentNumber: 2,
              paidAmountMinor: null,
              paidDate: null,
              status: 'unpaid',
            },
          ],
          paymentMethod: 'bank_transfer',
          status: 'active',
          totalAmountMinor: '100000',
          totalInstallments: 2,
          updatedAt: '2026-09-03T00:00:00.000Z',
        },
      ],
      transactions: [],
    })
    renderPage(<InstallmentsPage />)

    expect(await screen.findByText('เงินกู้ตัวอย่าง')).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: 'สร้างแผนผ่อน' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('2/2 · ยังไม่จ่าย')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'บันทึกว่าจ่ายแล้ว' }))
    expect(screen.getByRole('dialog', { name: 'งวด 2/2' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('ยอดที่จ่าย (บาท)')).toHaveLength(1)
    expect(screen.getAllByLabelText('วันที่ชำระ')).toHaveLength(1)
    expect(screen.getByLabelText('ปิดยอดผ่อนทั้งหมด')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    fireEvent.click(screen.getByRole('button', { name: 'จ่ายแล้ว' }))
    expect(screen.getByRole('dialog', { name: 'งวด 2/2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    fireEvent.click(screen.getByRole('button', { name: '+ สร้างแผนผ่อน' }))
    expect(
      screen.getByRole('dialog', { name: 'สร้างแผนผ่อน' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('ยอดรวม (บาท, ไม่บังคับ)')).toBeInTheDocument()
    expect(screen.getByLabelText('ยอดจ่ายต่องวด (บาท)')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('จำนวนงวด'), {
      target: { value: '60' },
    })
    fireEvent.change(screen.getByLabelText('วันที่งวดแรก'), {
      target: { value: '2025-10-05' },
    })
    expect(screen.getByText('งวดสุดท้าย 5 ก.ย. 2573')).toBeInTheDocument()
  })

  it('shows installment plans ten at a time', async () => {
    stubFinanceFetch({
      categories: [],
      plans: Array.from({ length: 11 }, (_, index) => ({
        categoryId: '11111111-1111-4111-8111-111111111111',
        categoryName: 'สินเชื่อสมมติ',
        createdAt: '2026-09-03T00:00:00.000Z',
        creditCardId: null,
        creditCardMaskedSuffix: null,
        creditCardName: null,
        description: `แผน ${index + 1}`,
        endDate: `2026-09-${String(11 - index).padStart(2, '0')}`,
        firstPaymentDate: `2026-09-${String(11 - index).padStart(2, '0')}`,
        id: `plan-${index + 1}`,
        occurrences: [
          {
            amountMinor: '10000',
            closesPlan: false,
            dueDate: `2026-09-${String(11 - index).padStart(2, '0')}`,
            id: `occurrence-${index + 1}`,
            installmentNumber: 1,
            paidAmountMinor: null,
            paidDate: null,
            status: 'cancelled',
          },
        ],
        paymentMethod: 'bank_transfer',
        status: 'cancelled',
        totalAmountMinor: '10000',
        totalInstallments: 1,
        updatedAt: '2026-09-03T00:00:00.000Z',
      })),
      transactions: [],
    })
    renderPage(<InstallmentsPage />)

    expect(await screen.findByText('ไม่มีแผนที่กำลังผ่อน')).toBeInTheDocument()
    expect(screen.queryByText('แผน 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ประวัติ 11' }))
    expect(screen.getByText('แผน 1')).toBeInTheDocument()
    expect(screen.getByText('แผน 10')).toBeInTheDocument()
    expect(screen.queryByText('แผน 11')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByText('แผน 11')).toBeInTheDocument()
    expect(screen.queryByText('แผน 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ก่อนหน้า' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'วันที่งวดแรก: ใหม่ก่อน' }),
    )
    expect(screen.getByText('แผน 11')).toBeInTheDocument()
    expect(screen.queryByText('แผน 1')).not.toBeInTheDocument()
  })
})

const fictionalCard = {
  cutoffDay: 17,
  dueDay: 1,
  id: '33333333-3333-4333-8333-333333333333',
  isActive: true,
  maskedSuffix: '1234',
  name: 'บัตรตัวอย่าง',
}

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
  cards = [],
  categories,
  plans = [],
  statements = [],
  transactions,
}: {
  cards?: readonly unknown[]
  categories: readonly unknown[]
  plans?: readonly unknown[]
  statements?: readonly unknown[]
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
      const body = url.includes('/api/credit-card-statements')
        ? { items: statements }
        : url.includes('/api/installment-plans')
          ? { items: plans }
          : url.includes('/api/credit-cards')
            ? { items: cards }
            : url.includes('/api/categories')
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
