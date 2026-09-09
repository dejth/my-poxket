import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CategoriesPage } from './CategoriesPage'
import { CreditCardsPage } from './CreditCardsPage'
import { DashboardPage } from './DashboardPage'
import { formatThbMinor } from './finance-format'
import { InstallmentsPage } from './InstallmentsPage'
import { RecurringExpensesPage } from './RecurringExpensesPage'
import { TransactionsPage } from './TransactionsPage'
import { AppShell } from '../app/AppShell'

const session = {
  csrfToken: 'fictional-csrf-token',
  user: { role: 'owner' as const, username: 'fictional-owner' },
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('finance pages', () => {
  it('retries category loading and associates validation errors with the field', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ message: 'โหลดไม่สำเร็จ' }),
      })
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      })
    vi.stubGlobal('fetch', fetch)
    renderPage(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'ลองอีกครั้ง' }))
    expect(
      await screen.findByText('ยังไม่มีหมวดหมู่ เพิ่มรายการแรกได้เลย'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มหมวดหมู่' }))
    expect(await screen.findByText('กรุณาระบุชื่อหมวดหมู่')).toBeInTheDocument()
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('กรุณาระบุชื่อหมวดหมู่')
  })

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
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['/', 'cancel', 'เพิ่มรายการด่วน'],
    ['/credit-cards?view=history#statements', 'cancel', 'เพิ่มรายการด่วน'],
    ['/installments', 'save', 'เพิ่มรายการด่วน'],
    ['/transactions', 'save', 'เพิ่มรายการด่วน'],
    ['/credit-cards?view=history#statements', 'cancel', 'เพิ่มรายการ'],
    ['/installments', 'save', 'เพิ่มรายการ'],
  ])('%s: %s via %s', async (origin, action, link) => {
    stubFinanceFetch({
      categories: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          direction: 'expense',
          name: 'อาหารสมมติ',
          isActive: true,
        },
      ],
      transactions: [],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['dashboard-summary', '2026-09'], {})
    const router = createMemoryRouter(
      [
        {
          element: (
            <AppShell
              session={session}
              isSigningOut={false}
              onSignOut={() => {}}
            />
          ),
          children: [
            { path: '/transactions', element: <TransactionsPage /> },
            { path: '*', element: <h1>หน้าก่อนหน้า</h1> },
          ],
        },
      ],
      { initialEntries: [origin] },
    )
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('link', { name: link }))
    const dialog = await screen.findByRole('dialog', {
      name: 'เพิ่มรายรับหรือรายจ่าย',
    })
    if (action === 'cancel') {
      fireEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    } else {
      await within(dialog).findByRole('option', { name: 'อาหารสมมติ' })
      fireEvent.change(within(dialog).getByLabelText('จำนวนเงิน (บาท)'), {
        target: { value: '100' },
      })
      fireEvent.change(within(dialog).getByLabelText('รายละเอียด'), {
        target: { value: 'รายการสมมติ' },
      })
      fireEvent.change(within(dialog).getByLabelText('หมวดหมู่'), {
        target: { value: '11111111-1111-4111-8111-111111111111' },
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'บันทึกรายการ' }),
      )
    }
    await waitFor(() =>
      expect(
        `${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`,
      ).toBe(origin),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    if (action === 'save')
      expect(
        queryClient.getQueryState(['dashboard-summary', '2026-09'])
          ?.isInvalidated,
      ).toBe(true)
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
    expect(formatThbMinor('-100000')).toBe('-฿1,000.00')
  })

  it('separates monthly activity, cash flow, payables, and history', async () => {
    stubFinanceFetch({
      categories: [],
      summary: {
        activity: {
          categories: [
            {
              amountMinor: '30000',
              categoryId: '11111111-1111-4111-8111-111111111111',
              categoryName: 'อาหารสมมติ',
              direction: 'expense',
            },
          ],
          expenseMinor: '30000',
          incomeMinor: '100000',
          netMinor: '70000',
        },
        cashFlow: {
          inflowMinor: '100000',
          netMinor: '-100000',
          outflowMinor: '200000',
        },
        history: [
          {
            amountMinor: '50000',
            context: 'ผ่อน 2/2 · settled',
            date: '2026-09-02',
            dueDate: '2026-09-02',
            id: 'installment:history',
            source: 'installment',
            status: 'paid',
            title: 'ปิดยอดสมมติ',
          },
        ],
        payables: [
          {
            amountMinor: '30000',
            cardId: fictionalCard.id,
            context: 'รอบบัญชี 2026-09-17 · ครบกำหนด 2026-10-01',
            dueDate: '2026-09-30',
            id: `card:${fictionalCard.id}:2026-09-17`,
            officialDueDate: '2026-10-01',
            source: 'credit_card_statement',
            statementEndDate: '2026-09-17',
            status: 'overdue',
            title: 'บัตรตัวอย่าง •••• 1234',
          },
          {
            amountMinor: '10000',
            context: 'ผ่อน 1/10',
            dueDate: '2026-10-05',
            id: 'installment:future',
            source: 'installment',
            status: 'unpaid',
            title: 'แผนผ่อนสมมติ',
          },
        ],
        period: '2026-09',
        periodEnd: '2026-09-30',
        periodStart: '2026-09-01',
        throughDate: '2026-10-31',
        today: '2026-09-20',
      },
      transactions: [],
    })
    renderPage(<DashboardPage />)

    expect(
      await screen.findByRole('heading', {
        name: 'กิจกรรมเดือน กันยายน 2569',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('-฿1,000.00')).toBeInTheDocument()
    expect(screen.getByText('อาหารสมมติ')).toBeInTheDocument()
    expect(screen.getByText('เกินกำหนด')).toBeInTheDocument()
    expect(screen.getByText('แผนผ่อนสมมติ')).toBeInTheDocument()
    expect(screen.getByText('ปิดยอดสมมติ')).toBeInTheDocument()

    const payButton = screen.getByRole('button', { name: 'บันทึกการจ่าย' })
    fireEvent.click(payButton)
    expect(
      screen.getByRole('dialog', { name: 'บัตรตัวอย่าง •••• 1234' }),
    ).toBeInTheDocument()
    const amountInput = screen.getByLabelText('ยอดที่จ่าย (บาท)')
    expect(amountInput).toHaveValue(300)
    expect(amountInput).toHaveFocus()
    fireEvent(
      screen.getByRole('dialog', { name: 'บัตรตัวอย่าง •••• 1234' }),
      new Event('cancel', { cancelable: true }),
    )
    expect(
      screen.queryByRole('dialog', { name: 'บัตรตัวอย่าง •••• 1234' }),
    ).not.toBeInTheDocument()
  })

  it('shows clear empty dashboard states', async () => {
    stubFinanceFetch({
      categories: [],
      summary: emptyDashboardSummary(),
      transactions: [],
    })
    renderPage(<DashboardPage />)

    expect(
      await screen.findByText('ยังไม่มีกิจกรรมในเดือนนี้'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('ไม่มียอดค้างหรือยอดที่กำลังจะถึงกำหนด'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('ยังไม่มีประวัติการจ่ายหรือยกเลิกในเดือนนี้'),
    ).toBeInTheDocument()
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

  it('shows recurring rules separately and exposes explicit stop choices', async () => {
    stubFinanceFetch({
      categories: [],
      recurring: [
        {
          amountMinor: '70000',
          categoryId: '11111111-1111-4111-8111-111111111111',
          categoryName: 'ค่าสมาชิกสมมติ',
          createdAt: '2026-09-03T00:00:00.000Z',
          creditCardId: null,
          creditCardMaskedSuffix: null,
          creditCardName: null,
          description: 'บริการสมมติรายเดือน',
          id: '77777777-7777-4777-8777-777777777777',
          occurrences: [
            {
              amountMinor: '70000',
              categoryId: '11111111-1111-4111-8111-111111111111',
              categoryName: 'ค่าสมาชิกสมมติ',
              creditCardId: null,
              creditCardMaskedSuffix: null,
              creditCardName: null,
              description: 'บริการสมมติรายเดือน',
              dueDate: '2026-09-10',
              id: '88888888-8888-4888-8888-888888888888',
              paidAmountMinor: null,
              paidDate: null,
              paymentMethod: 'bank_transfer',
              recurrencePeriod: '2026-09',
              status: 'unpaid',
            },
          ],
          paymentMethod: 'bank_transfer',
          recurrenceDay: 10,
          startDate: '2026-09-10',
          status: 'active',
          updatedAt: '2026-09-03T00:00:00.000Z',
        },
      ],
      transactions: [],
    })
    renderPage(<RecurringExpensesPage />)

    expect(await screen.findByText('บริการสมมติรายเดือน')).toBeInTheDocument()
    expect(screen.getAllByText(/ประจำ/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'หยุดรายการประจำ' }))
    expect(
      screen.getByRole('dialog', { name: 'จัดการรายการอนาคต' }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('ยกเลิกรายการอนาคตที่ยังไม่จ่าย'),
    ).toBeChecked()
    expect(
      screen.getByLabelText('คงรายการที่สร้างไว้ให้จ่ายต่อ'),
    ).toBeInTheDocument()
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
  recurring = [],
  statements = [],
  summary,
  transactions,
}: {
  cards?: readonly unknown[]
  categories: readonly unknown[]
  plans?: readonly unknown[]
  recurring?: readonly unknown[]
  statements?: readonly unknown[]
  summary?: unknown
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
      const body = url.includes('/api/dashboard-summary')
        ? summary
        : url.includes('/api/credit-card-statements')
          ? { items: statements }
          : url.includes('/api/recurring-expenses')
            ? { items: recurring }
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

function emptyDashboardSummary() {
  return {
    activity: {
      categories: [],
      expenseMinor: '0',
      incomeMinor: '0',
      netMinor: '0',
    },
    cashFlow: { inflowMinor: '0', netMinor: '0', outflowMinor: '0' },
    history: [],
    payables: [],
    period: '2026-09',
    periodEnd: '2026-09-30',
    periodStart: '2026-09-01',
    throughDate: '2026-10-31',
    today: '2026-09-20',
  }
}
