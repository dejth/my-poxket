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
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'เพิ่มหมวดหมู่',
      }),
    )
    expect(await screen.findByText('กรุณาระบุชื่อหมวดหมู่')).toBeInTheDocument()
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('กรุณาระบุชื่อหมวดหมู่')
  })

  it('renders responsive transaction semantics and opens the focused form', async () => {
    stubFinanceFetch({
      cards: [
        fictionalCard,
        {
          ...fictionalCard,
          id: '44444444-4444-4444-8444-444444444444',
          isActive: false,
          name: 'บัตรที่ปิดใช้งาน',
        },
      ],
      categories: [],
      transactions: [],
    })
    renderPage(<TransactionsPage />, '/?action=new')

    expect(
      await screen.findByRole('dialog', { name: 'เพิ่มรายรับหรือรายจ่าย' }),
    ).toBeInTheDocument()
    const amountInput = screen.getByLabelText('จำนวนเงิน (บาท)')
    expect(amountInput).toHaveAttribute('inputmode', 'decimal')
    expect(amountInput).toHaveAttribute('autocomplete', 'off')
    expect(screen.getByLabelText('วันที่รายการ')).toHaveAttribute(
      'type',
      'date',
    )
    expect(
      amountInput.compareDocumentPosition(
        within(
          screen.getByRole('dialog', { name: 'เพิ่มรายรับหรือรายจ่าย' }),
        ).getByRole('radio', { name: 'รายจ่าย' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await screen.findByRole('option', { name: 'บัตรตัวอย่าง •••• 1234' })
    fireEvent.change(screen.getAllByLabelText('วิธีชำระ')[1]!, {
      target: { value: 'credit_card' },
    })
    const dialog = screen.getByRole('dialog', {
      name: 'เพิ่มรายรับหรือรายจ่าย',
    })
    expect(screen.getAllByLabelText('บัตรเครดิต')).toHaveLength(2)
    expect(
      screen.getAllByRole('option', { name: 'บัตรตัวอย่าง •••• 1234' }),
    ).toHaveLength(2)
    expect(
      within(dialog).queryByRole('option', { name: /บัตรที่ปิดใช้งาน/ }),
    ).not.toBeInTheDocument()
  })

  it('applies combined transaction filters and clears them', async () => {
    stubFinanceFetch({
      cards: [fictionalCard],
      categories: [
        {
          direction: 'expense',
          id: '11111111-1111-4111-8111-111111111111',
          isActive: true,
          name: 'อาหารสมมติ',
        },
      ],
      transactions: [],
    })
    renderPage(<TransactionsPage />)

    expect(await screen.findByText('ยังไม่มีรายการ')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'ทั้งหมด' })).toBeChecked()
    expect(screen.getByText('เงื่อนไขที่ใช้ · 1')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหา' }), {
      target: { value: 'กลางวัน' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'รายจ่าย' }))
    fireEvent.click(screen.getByText('ตัวกรองเพิ่มเติม · 1'))
    fireEvent.change(screen.getByLabelText('หมวดหมู่'), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    })
    fireEvent.change(screen.getByLabelText('วิธีชำระ'), {
      target: { value: 'cash' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'กรองรายการ' }))

    await waitFor(() => {
      const request = vi.mocked(fetch).mock.calls.find(([input]) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        if (!url.includes('/api/transactions?')) return false
        const params = new URL(url, 'http://localhost').searchParams
        return (
          params.get('page') === '1' &&
          params.get('search') === 'กลางวัน' &&
          params.get('direction') === 'expense' &&
          params.get('categoryId') === '11111111-1111-4111-8111-111111111111' &&
          params.get('paymentMethod') === 'cash'
        )
      })
      expect(request).toBeDefined()
    })
    expect(screen.getByText('เงื่อนไขที่ใช้ · 5')).toBeInTheDocument()
    expect(
      screen.getByText(/กลางวัน.*รายจ่าย.*อาหารสมมติ.*ใช้งาน.*เงินสด/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }))
    expect(screen.getByRole('radio', { name: 'ทั้งหมด' })).toBeChecked()
    expect(screen.getByRole('searchbox', { name: 'ค้นหา' })).toHaveValue('')
    expect(screen.getByText('เงื่อนไขที่ใช้ · 1')).toBeInTheDocument()
  })

  it('opens the transaction form from the global quick-add URL', async () => {
    stubFinanceFetch({ categories: [], transactions: [] })
    const { router } = renderPage(
      <TransactionsPage />,
      '/transactions?action=new',
    )

    expect(
      await screen.findByRole('dialog', { name: 'เพิ่มรายรับหรือรายจ่าย' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/transactions')
    expect(router.state.location.search).toBe('')
  })

  it('retains entered values when saving fails', async () => {
    stubFinanceFetch({
      categories: [
        {
          direction: 'expense',
          id: '11111111-1111-4111-8111-111111111111',
          isActive: true,
          name: 'อาหารสมมติ',
        },
      ],
      transactions: [],
    })
    const successfulFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) =>
      init?.method === 'POST'
        ? Promise.resolve(
            new Response(JSON.stringify({ message: 'บันทึกไม่สำเร็จ' }), {
              headers: { 'content-type': 'application/json' },
              status: 503,
            }),
          )
        : successfulFetch(input, init),
    )
    renderPage(<TransactionsPage />, '/transactions?action=new')

    const dialog = await screen.findByRole('dialog', {
      name: 'เพิ่มรายรับหรือรายจ่าย',
    })
    await within(dialog).findByRole('option', { name: 'อาหารสมมติ' })
    fireEvent.change(within(dialog).getByLabelText('จำนวนเงิน (บาท)'), {
      target: { value: '125.50' },
    })
    fireEvent.change(within(dialog).getByLabelText('รายละเอียด'), {
      target: { value: 'รายการที่ต้องเก็บค่าไว้' },
    })
    fireEvent.change(within(dialog).getByLabelText('หมวดหมู่'), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'บันทึกรายการ' }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'ไม่สามารถดำเนินการได้',
    )
    expect(within(dialog).getByLabelText('จำนวนเงิน (บาท)')).toHaveValue(
      '125.50',
    )
    expect(within(dialog).getByLabelText('รายละเอียด')).toHaveValue(
      'รายการที่ต้องเก็บค่าไว้',
    )
  })

  it('keeps long amounts, history statuses, and named actions accessible', async () => {
    const baseTransaction = {
      amountMinor: '99999999999',
      categoryDirection: 'expense',
      categoryId: '11111111-1111-4111-8111-111111111111',
      categoryName: 'หมวดหมู่สมมติชื่อยาวมากสำหรับตรวจการตัดบรรทัด',
      creditCardId: null,
      creditCardMaskedSuffix: null,
      creditCardName: null,
      correctsTransactionId: null,
      createdAt: '2026-09-07T03:00:00.000Z',
      direction: 'expense',
      paymentMethod: 'cash',
      transactionDate: '2026-09-07',
      updatedAt: '2026-09-07T03:00:00.000Z',
    }
    stubFinanceFetch({
      categories: [],
      transactions: [
        {
          ...baseTransaction,
          description: 'รายละเอียดรายการสมมติที่ยาวมากและต้องไม่ชนกับจำนวนเงิน',
          id: 'transaction:active',
          status: 'active',
        },
        {
          ...baseTransaction,
          description: 'รายการที่ยกเลิก',
          id: 'transaction:cancelled',
          status: 'cancelled',
        },
        {
          ...baseTransaction,
          description: 'รายการที่ถูกแก้ไข',
          id: 'transaction:superseded',
          status: 'superseded',
        },
      ],
    })
    renderPage(<TransactionsPage />)

    const table = await screen.findByRole('table', {
      name: 'รายการรายรับและรายจ่าย',
    })
    expect(within(table).getAllByText('−฿999,999,999.99')).toHaveLength(3)
    expect(screen.getAllByText('รายการที่ยกเลิก')).toHaveLength(2)
    expect(screen.getAllByText('รายการที่ถูกแก้ไข')).toHaveLength(2)
    expect(
      screen.getAllByRole('button', {
        name: 'แก้ไขรายการ รายละเอียดรายการสมมติที่ยาวมากและต้องไม่ชนกับจำนวนเงิน',
      }),
    ).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: 'แก้ไขรายการ รายการที่ยกเลิก' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['/', 'cancel', 'เพิ่มรายการด่วน'],
    ['/categories?view=active#list', 'escape', 'เพิ่มรายการด่วน'],
    ['/credit-cards?view=history#statements', 'cancel', 'เพิ่มรายการด่วน'],
    ['/installments', 'save', 'เพิ่มรายการด่วน'],
    ['/transactions', 'save', 'เพิ่มรายการด่วน'],
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
    queryClient.setQueryData(
      ['transactions', 'dashboard-recent', '2026-09'],
      {},
    )
    queryClient.setQueryData(['credit-card-statements'], {})
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
    } else if (action === 'escape') {
      fireEvent(dialog, new Event('cancel', { cancelable: true }))
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
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    if (action === 'save')
      for (const key of [
        ['dashboard-summary', '2026-09'],
        ['transactions', 'dashboard-recent', '2026-09'],
        ['credit-card-statements'],
      ])
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it('shows active and inactive categories without hiding history', async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    stubFinanceFetch({
      categories: [
        {
          direction: 'expense',
          id: '11111111-1111-4111-8111-111111111111',
          isActive: true,
          name: 'หมวดหมู่รายจ่ายสมมติชื่อยาวมากสำหรับตรวจการตัดบรรทัดบนหน้าจอแคบ',
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

    const longName =
      'หมวดหมู่รายจ่ายสมมติชื่อยาวมากสำหรับตรวจการตัดบรรทัดบนหน้าจอแคบ'
    expect(await screen.findByText(longName)).toBeInTheDocument()
    expect(screen.getByText('รายได้เดิม')).toBeInTheDocument()
    expect(
      screen.getByText('ปิดใช้งาน', { selector: '.status-label' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'เปิดใช้งานหมวดหมู่ รายได้เดิม' }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: `ปิดใช้งานหมวดหมู่ ${longName}` }),
    )
    expect(confirm).toHaveBeenCalledWith(
      'ปิดหมวดหมู่นี้ใช่หรือไม่ ประวัติรายการเดิมจะยังคงอยู่',
    )
    expect(await screen.findByText('ปิดใช้งานหมวดหมู่แล้ว')).toBeInTheDocument()
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
            {
              amountMinor: '10000',
              categoryId: '33333333-3333-4333-8333-333333333333',
              categoryName: 'เดินทางสมมติ',
              direction: 'expense',
            },
            {
              amountMinor: '100000',
              categoryId: '22222222-2222-4222-8222-222222222222',
              categoryName: 'เงินเดือนสมมติ',
              direction: 'income',
            },
          ],
          expenseMinor: '40000',
          incomeMinor: '100000',
          netMinor: '60000',
        },
        cashFlow: {
          inflowMinor: '100000',
          netMinor: '-100000',
          outflowMinor: '200000',
        },
        history: [
          {
            amountMinor: '50000',
            context: 'ผ่อน 2/2 · ปิดยอดก่อนกำหนด',
            date: '2026-09-02',
            dueDate: '2026-09-02',
            id: 'installment:history',
            source: 'installment',
            status: 'paid',
            title: 'ปิดยอดสมมติ',
          },
          {
            amountMinor: '7000',
            context: 'ประจำ 2026-09',
            date: '2026-09-03',
            dueDate: '2026-09-03',
            id: 'recurring:history',
            source: 'recurring',
            status: 'cancelled',
            title: 'บริการสมมติที่ยกเลิก',
          },
        ],
        payables: [
          {
            amountMinor: '30000',
            cardId: fictionalCard.id,
            context: 'รอบบัญชี 2026-09-17',
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
          {
            amountMinor: '7000',
            context: 'ประจำ 2026-10',
            dueDate: '2026-10-14',
            id: 'recurring:future',
            source: 'recurring',
            status: 'unpaid',
            title: 'บริการสมมติ',
          },
        ],
        period: '2026-09',
        periodEnd: '2026-09-30',
        periodStart: '2026-09-01',
        throughDate: '2026-10-31',
        today: '2026-09-20',
      },
      transactions: [
        {
          amountMinor: '150000',
          categoryDirection: 'expense',
          categoryId: '11111111-1111-4111-8111-111111111111',
          categoryName: 'อาหารสมมติ',
          creditCardId: null,
          creditCardMaskedSuffix: null,
          creditCardName: null,
          correctsTransactionId: null,
          createdAt: '2026-09-07T03:00:00.000Z',
          description: 'อาหารกลางวันสมมติ',
          direction: 'expense',
          id: 'transaction:recent',
          paymentMethod: 'cash',
          status: 'active',
          transactionDate: '2026-09-07',
          updatedAt: '2026-09-07T03:00:00.000Z',
        },
      ],
    })
    renderPage(<DashboardPage />)

    expect(
      await screen.findByRole('heading', {
        name: 'กิจกรรมเดือน กันยายน 2569',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('-฿1,000.00')).toBeInTheDocument()
    expect(screen.getByText('อาหารสมมติ')).toBeInTheDocument()
    expect(screen.getByText('เดินทางสมมติ')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'รายรับตามหมวดหมู่' }),
    ).toBeInTheDocument()
    expect(screen.getByText('เงินเดือนสมมติ')).toBeInTheDocument()
    expect(screen.getByText('เกินกำหนด')).toBeInTheDocument()
    expect(screen.getByText('แผนผ่อนสมมติ')).toBeInTheDocument()
    expect(screen.getByText('ปิดยอดสมมติ')).toBeInTheDocument()
    expect(screen.getByText('รอบบัญชี 2026-09-17')).toHaveClass(
      'source-badge',
      'is-credit_card_statement',
    )
    expect(screen.getByText('ผ่อน 1/10')).toHaveClass(
      'source-badge',
      'is-installment',
    )
    expect(screen.getByText('ประจำ 2026-10')).toHaveClass(
      'source-badge',
      'is-recurring',
    )
    expect(screen.getByText('วางแผน 30 ก.ย. 2569')).toBeInTheDocument()
    expect(screen.getByText('ครบกำหนด 1 ต.ค. 2569')).toBeInTheDocument()
    expect(screen.getByText('จ่ายแล้ว')).toBeInTheDocument()
    expect(screen.getByText('ยกเลิก')).toBeInTheDocument()
    expect(screen.getByText('บริการสมมติที่ยกเลิก')).toBeInTheDocument()
    expect(await screen.findByText('อาหารกลางวันสมมติ')).toBeInTheDocument()
    expect(screen.getByText('−฿1,500.00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ดูทั้งหมด' })).toHaveAttribute(
      'href',
      '/transactions',
    )

    const headings = [
      'กิจกรรมเดือน กันยายน 2569',
      'ยอดที่ต้องจ่าย',
      'รายการล่าสุดในเดือนนี้',
      'สัดส่วนรายจ่าย',
      'กระแสเงินสด',
      'ประวัติเดือนนี้',
    ].map((name) => screen.getByRole('heading', { name }))
    for (let index = 1; index < headings.length; index += 1) {
      expect(
        headings[index - 1]!.compareDocumentPosition(headings[index]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }

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
      await screen.findByText('ยังไม่มีรายจ่ายในเดือนนี้'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('ไม่มียอดค้างหรือยอดที่กำลังจะถึงกำหนด'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('ยังไม่มีประวัติการจ่ายหรือยกเลิกในเดือนนี้'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('ยังไม่มีรายการในเดือนนี้'),
    ).toBeInTheDocument()
  })

  it('retries recent transactions without hiding the loaded summary', async () => {
    const fetch = vi.fn((input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      if (url.includes('/api/dashboard-summary')) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyDashboardSummary()), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
        )
      }
      const recentAttempts = fetch.mock.calls.filter(([request]) => {
        const requestUrl =
          typeof request === 'string'
            ? request
            : request instanceof URL
              ? request.href
              : request.url
        return requestUrl.includes('/api/transactions')
      }).length
      return Promise.resolve(
        new Response(
          recentAttempts === 1
            ? JSON.stringify({
                error: { message: 'โหลดรายการล่าสุดไม่สำเร็จ' },
              })
            : JSON.stringify({ items: [], nextPage: null }),
          {
            headers: { 'content-type': 'application/json' },
            status: recentAttempts === 1 ? 503 : 200,
          },
        ),
      )
    })
    vi.stubGlobal('fetch', fetch)
    renderPage(<DashboardPage />)

    expect(
      await screen.findByRole('heading', {
        name: 'กิจกรรมเดือน กันยายน 2569',
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('โหลดรายการล่าสุดไม่สำเร็จ'),
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&pageSize=5&status=active',
      { credentials: 'include' },
    )

    fireEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }))
    expect(
      await screen.findByText('ยังไม่มีรายการในเดือนนี้'),
    ).toBeInTheDocument()
  })

  it('removes the previous summary while a newly selected month loads', async () => {
    let resolveOctober!: (response: Response) => void
    const octoberResponse = new Promise<Response>((resolve) => {
      resolveOctober = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        if (url.includes('period=2026-10')) return octoberResponse
        return Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes('/api/dashboard-summary')
                ? emptyDashboardSummary()
                : {},
            ),
            { headers: { 'content-type': 'application/json' }, status: 200 },
          ),
        )
      }),
    )
    renderPage(<DashboardPage />)

    expect(
      await screen.findByRole('heading', {
        name: 'กิจกรรมเดือน กันยายน 2569',
      }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('เดือนที่สรุป'), {
      target: { value: '2026-10' },
    })

    expect(await screen.findByText('กำลังสรุปข้อมูล…')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'กิจกรรมเดือน กันยายน 2569',
      }),
    ).not.toBeInTheDocument()

    resolveOctober(
      new Response(
        JSON.stringify({
          ...emptyDashboardSummary(),
          period: '2026-10',
          periodEnd: '2026-10-31',
          periodStart: '2026-10-01',
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    )
    expect(
      await screen.findByRole('heading', {
        name: 'กิจกรรมเดือน ตุลาคม 2569',
      }),
    ).toBeInTheDocument()
  })

  it('shows card rules and keeps official and planned payment dates distinct', async () => {
    const inactiveCard = {
      ...fictionalCard,
      id: '44444444-4444-4444-8444-444444444444',
      isActive: false,
      maskedSuffix: '5678',
      name: 'บัตรเก่า',
    }
    stubFinanceFetch({
      cards: [fictionalCard, inactiveCard],
      categories: [],
      statements: [
        {
          amountMinor: '70000',
          cardId: fictionalCard.id,
          cardName: fictionalCard.name,
          maskedSuffix: fictionalCard.maskedSuffix,
          officialDueDate: '2026-10-01',
          paidAmountMinor: null,
          paidDate: null,
          plannedPaymentDate: '2026-09-30',
          purchaseCount: 1,
          statementEndDate: '2026-09-17',
          status: 'unpaid',
        },
        {
          amountMinor: '25000',
          cardId: inactiveCard.id,
          cardName: inactiveCard.name,
          maskedSuffix: inactiveCard.maskedSuffix,
          officialDueDate: '2026-09-01',
          paidAmountMinor: '25000',
          paidDate: '2026-08-30',
          plannedPaymentDate: '2026-08-30',
          purchaseCount: 2,
          statementEndDate: '2026-08-17',
          status: 'paid',
        },
      ],
      transactions: [],
    })
    renderPage(<CreditCardsPage />)

    expect(
      await screen.findAllByText('บัตรตัวอย่าง •••• 1234'),
    ).not.toHaveLength(0)
    expect(screen.getByText('ใช้งานอยู่')).toBeInTheDocument()
    expect(
      screen.getByText('ปิดใช้งาน', { selector: '.status-label' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('กำหนดชำระตามบัตร')).toHaveLength(3)
    expect(screen.getAllByText('วันที่วางแผนชำระ')).toHaveLength(3)
    expect(screen.getAllByText('ยังไม่จ่าย')).toHaveLength(2)
    expect(screen.getAllByText('จ่ายแล้ว')).toHaveLength(2)
    expect(screen.getAllByText('฿700.00')).toHaveLength(2)
    const add = screen.getByRole('button', { name: 'เพิ่มบัตร' })
    add.focus()
    fireEvent.click(add)
    expect(
      screen.getByRole('dialog', { name: 'เพิ่มบัตร' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }))
    expect(add).toHaveFocus()
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
    expect(screen.getByText('1 จาก 2 งวด')).toBeInTheDocument()
    expect(screen.getByText('2/2 · ยังไม่จ่าย')).toBeInTheDocument()
    expect(screen.getAllByText(/ยอดตามแผน/).length).toBeGreaterThan(0)
    expect(screen.getByText('ยอดจ่ายจริง')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /บันทึกว่าจ่ายแล้ว งวด 2\/2/ }),
    )
    expect(screen.getByRole('dialog', { name: 'งวด 2/2' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('ยอดที่จ่าย (บาท)')).toHaveLength(1)
    expect(screen.getAllByLabelText('วันที่ชำระ')).toHaveLength(1)
    expect(screen.getByLabelText('ปิดยอดผ่อนทั้งหมด')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    fireEvent.click(screen.getByRole('button', { name: /^จ่ายแล้ว งวด 2\/2/ }))
    expect(screen.getByRole('dialog', { name: 'งวด 2/2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    fireEvent.click(screen.getByRole('button', { name: 'สร้างแผนผ่อน' }))
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
            installmentNumber: index === 0 ? 10 : 1,
            paidAmountMinor: null,
            paidDate: null,
            status: 'cancelled',
          },
        ],
        paymentMethod: 'bank_transfer',
        status: 'cancelled',
        totalAmountMinor: '10000',
        totalInstallments: index === 0 ? 10 : 1,
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
    expect(screen.getByText('10/10 · ยกเลิกแล้ว')).toBeInTheDocument()
    expect(screen.getAllByText('1/1 · ยกเลิกแล้ว').length).toBeGreaterThan(0)
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

  it('separates recurring rule and occurrence statuses and explains future changes', async () => {
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
            {
              amountMinor: '69000',
              categoryId: '11111111-1111-4111-8111-111111111111',
              categoryName: 'ค่าสมาชิกสมมติ',
              creditCardId: null,
              creditCardMaskedSuffix: null,
              creditCardName: null,
              description: 'บริการสมมติรายเดือน',
              dueDate: '2026-08-10',
              id: '99999999-9999-4999-8999-999999999999',
              paidAmountMinor: '68000',
              paidDate: '2026-08-09',
              paymentMethod: 'bank_transfer',
              recurrencePeriod: '2026-08',
              status: 'paid',
            },
            {
              amountMinor: '70000',
              categoryId: '11111111-1111-4111-8111-111111111111',
              categoryName: 'ค่าสมาชิกสมมติ',
              creditCardId: null,
              creditCardMaskedSuffix: null,
              creditCardName: null,
              description: 'บริการสมมติรายเดือน',
              dueDate: '2026-07-10',
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              paidAmountMinor: null,
              paidDate: null,
              paymentMethod: 'bank_transfer',
              recurrencePeriod: '2026-07',
              status: 'cancelled',
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
    expect(screen.getByText(/กฎรายเดือน/)).toBeInTheDocument()
    expect(screen.getByText('ทำงานอยู่')).toBeInTheDocument()
    expect(screen.getByText('รายการเดือนปัจจุบัน')).toBeInTheDocument()
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('รายการรายเดือนที่สร้างแล้ว 3 รายการ'))
    expect(screen.getAllByText('ยังไม่จ่าย')).toHaveLength(2)
    expect(screen.getAllByText('จ่ายแล้ว')).toHaveLength(2)
    expect(screen.getByText('ยกเลิกแล้ว')).toBeInTheDocument()
    expect(screen.getByText(/จ่าย ฿680\.00 เมื่อ/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขอนาคต' }))
    expect(
      screen.getByText('มีผลกับรายการที่ยังไม่จ่ายตั้งแต่เดือนนี้เป็นต้นไป'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('รายการที่จ่ายแล้วและประวัติเดิมจะคงข้อมูลเดิม'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }))
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
    expect(
      screen.getByText('รายการที่จ่ายแล้วและประวัติเดิมจะไม่ถูกแก้ไข'),
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
        children: [
          { element: page, index: true },
          { element: page, path: 'transactions' },
        ],
        element: <Outlet context={{ session }} />,
        path: '/',
      },
    ],
    { initialEntries: [initialEntry] },
  )

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    queryClient,
    router,
  }
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
