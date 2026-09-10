import { QueryError } from '../app/QueryError'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ActionNotice } from '../app/ActionNotice'
import {
  getDashboardSummary,
  getTransactions,
  setCreditCardStatementPayment,
  type DashboardHistoryData,
  type DashboardPayableData,
  type TransactionData,
} from '../app/api'
import { useAuthenticatedContext } from '../app/authenticated-context'
import {
  formatThaiDate,
  formatThbMinor,
  todayInBangkok,
} from './finance-format'

export function DashboardPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const today = todayInBangkok()
  const [period, setPeriod] = useState(today.slice(0, 7))
  const [notice, setNotice] = useState<string | null>(null)
  const [paymentTarget, setPaymentTarget] =
    useState<DashboardPayableData | null>(null)
  const [paidAmount, setPaidAmount] = useState('')
  const [paidDate, setPaidDate] = useState(today)
  const paymentDialogRef = useRef<HTMLDialogElement>(null)
  const payablesTitleRef = useRef<HTMLHeadingElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const summaryQuery = useQuery({
    queryFn: () => getDashboardSummary(session.csrfToken, period),
    queryKey: ['dashboard-summary', period],
  })
  const recentTransactionsQuery = useQuery({
    enabled: summaryQuery.data?.period === period,
    queryFn: () =>
      getTransactions({
        dateFrom: summaryQuery.data!.periodStart,
        dateTo: summaryQuery.data!.periodEnd,
        pageSize: 5,
        status: 'active',
      }),
    queryKey: ['transactions', 'dashboard-recent', period],
  })
  const paymentMutation = useMutation({
    mutationFn: ({
      cardId,
      input,
      statementEndDate,
    }: {
      cardId: string
      input:
        | { paidAmount: string; paidDate: string; status: 'paid' }
        | { status: 'unpaid' }
      statementEndDate: string
    }) =>
      setCreditCardStatementPayment(
        session.csrfToken,
        cardId,
        statementEndDate,
        input,
      ),
    onSuccess: async (_, variables) => {
      setNotice(
        variables.input.status === 'paid'
          ? 'บันทึกการจ่ายรอบบัตรแล้ว'
          : 'ย้อนสถานะรอบบัตรเป็นยังไม่จ่ายแล้ว',
      )
      setPaymentTarget(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({
          queryKey: ['credit-card-statements'],
        }),
      ])
      payablesTitleRef.current?.focus()
    },
  })
  const summary = summaryQuery.data

  useEffect(() => {
    const dialog = paymentDialogRef.current
    if (!paymentTarget || !dialog || dialog.open) return
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
  }, [paymentTarget])

  return (
    <main className="page-shell">
      <header className="page-header dashboard-header">
        <div>
          <p className="eyebrow">ภาพรวมรายเดือน</p>
          <h1>สรุปการเงิน</h1>
          <p>เห็นกิจกรรม กระแสเงินสด และยอดที่ต้องจ่ายในที่เดียว</p>
        </div>
        <label className="dashboard-period">
          เลือกเดือน
          <input
            aria-label="เดือนที่สรุป"
            autoComplete="off"
            name="summary-period"
            onChange={(event) => {
              if (event.target.value) setPeriod(event.target.value)
            }}
            required
            type="month"
            value={period}
          />
        </label>
      </header>

      <ActionNotice message={notice} setMessage={setNotice} />

      {summaryQuery.isPending ? (
        <section
          className="surface dashboard-state"
          aria-busy="true"
          role="status"
        >
          กำลังสรุปข้อมูล…
        </section>
      ) : summaryQuery.isError ? (
        <QueryError
          message={summaryQuery.error.message}
          onRetry={() => {
            void summaryQuery.refetch()
          }}
        />
      ) : summary ? (
        <>
          <section aria-labelledby="activity-title">
            <div className="section-heading dashboard-section-heading">
              <div>
                <p className="eyebrow">ตามวันที่ทำรายการ</p>
                <h2 id="activity-title">
                  กิจกรรมเดือน {formatThaiPeriod(summary.period)}
                </h2>
              </div>
            </div>
            <div className="dashboard-metrics">
              <Metric
                hint="รายรับหักรายจ่ายตามวันที่ทำรายการ"
                label="สุทธิกิจกรรม"
                tone={
                  BigInt(summary.activity.netMinor) < 0n
                    ? 'negative'
                    : 'primary'
                }
                value={summary.activity.netMinor}
              />
              <Metric
                label="รายรับ"
                tone="income"
                value={summary.activity.incomeMinor}
              />
              <Metric
                label="รายจ่าย"
                tone="expense"
                value={summary.activity.expenseMinor}
              />
            </div>
          </section>

          <section
            className="dashboard-section"
            aria-labelledby="payables-title"
          >
            <div className="section-heading dashboard-section-heading">
              <div>
                <p className="eyebrow">
                  วางแผนจ่ายถึง {formatThaiDate(summary.throughDate)}
                </p>
                <h2 id="payables-title" ref={payablesTitleRef} tabIndex={-1}>
                  ยอดที่ต้องจ่าย
                </h2>
              </div>
              <span className="status-pill">
                {summary.payables.length} รายการ
              </span>
            </div>
            <div className="surface dashboard-panel payable-panel">
              {summary.payables.length === 0 ? (
                <p className="muted-state">
                  ไม่มียอดค้างหรือยอดที่กำลังจะถึงกำหนด
                </p>
              ) : (
                <ul className="dashboard-list payable-list">
                  {summary.payables.map((item) => (
                    <PayableItem
                      item={item}
                      key={item.id}
                      onPay={(target) => {
                        paymentMutation.reset()
                        previousFocusRef.current =
                          document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null
                        setPaymentTarget(target)
                        setPaidAmount(minorToDecimal(target.amountMinor))
                        setPaidDate(today)
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            className="dashboard-section"
            aria-labelledby="recent-transactions-title"
          >
            <div className="section-heading dashboard-section-heading">
              <div>
                <p className="eyebrow">ตามวันที่ทำรายการ</p>
                <h2 id="recent-transactions-title">รายการล่าสุดในเดือนนี้</h2>
              </div>
              <Link className="dashboard-item-link" to="/transactions">
                ดูทั้งหมด
              </Link>
            </div>
            <div className="surface dashboard-panel">
              {recentTransactionsQuery.isPending ? (
                <p className="muted-state" aria-busy="true" role="status">
                  กำลังโหลดรายการล่าสุด…
                </p>
              ) : recentTransactionsQuery.isError ? (
                <QueryError
                  message={recentTransactionsQuery.error.message}
                  onRetry={() => {
                    void recentTransactionsQuery.refetch()
                  }}
                />
              ) : recentTransactionsQuery.data.items.length === 0 ? (
                <p className="muted-state">ยังไม่มีรายการในเดือนนี้</p>
              ) : (
                <ul className="dashboard-list">
                  {recentTransactionsQuery.data.items.map((item) => (
                    <RecentTransactionItem item={item} key={item.id} />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="dashboard-grid">
            <section
              className="surface dashboard-panel"
              aria-labelledby="categories-title"
            >
              <div className="section-heading">
                <div>
                  <h2 id="categories-title">แยกตามหมวดหมู่</h2>
                  <p>รวมจากรายการที่ยังใช้งานอยู่</p>
                </div>
              </div>
              {summary.activity.categories.length === 0 ? (
                <p className="muted-state">ยังไม่มีกิจกรรมในเดือนนี้</p>
              ) : (
                <ul className="dashboard-list category-breakdown">
                  {summary.activity.categories.map((category) => (
                    <li key={`${category.direction}:${category.categoryId}`}>
                      <div>
                        <strong>{category.categoryName}</strong>
                        <small>
                          {category.direction === 'income'
                            ? 'รายรับ'
                            : 'รายจ่าย'}
                        </small>
                      </div>
                      <strong>{formatThbMinor(category.amountMinor)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className="surface dashboard-panel"
              aria-labelledby="cash-flow-title"
            >
              <div className="section-heading">
                <div>
                  <h2 id="cash-flow-title">กระแสเงินสด</h2>
                  <p>ตามวันที่จ่าย ไม่รวมยอดซื้อบัตรจนกว่าจะจ่ายรอบบัญชี</p>
                </div>
              </div>
              <dl className="cash-flow-summary">
                <div
                  className={
                    BigInt(summary.cashFlow.netMinor) < 0n
                      ? 'is-negative'
                      : 'is-positive'
                  }
                >
                  <dt>เงินเข้า</dt>
                  <dd>{formatThbMinor(summary.cashFlow.inflowMinor)}</dd>
                </div>
                <div>
                  <dt>เงินออก</dt>
                  <dd>{formatThbMinor(summary.cashFlow.outflowMinor)}</dd>
                </div>
                <div>
                  <dt>สุทธิกระแสเงินสด</dt>
                  <dd>{formatThbMinor(summary.cashFlow.netMinor)}</dd>
                </div>
              </dl>
            </section>
          </section>

          <section
            className="dashboard-section"
            aria-labelledby="history-title"
          >
            <div className="section-heading dashboard-section-heading">
              <div>
                <p className="eyebrow">
                  ตามวันที่จ่ายหรือวันที่ของรายการที่ยกเลิก
                </p>
                <h2 id="history-title">ประวัติเดือนนี้</h2>
              </div>
            </div>
            <div className="surface dashboard-panel history-panel">
              {summary.history.length === 0 ? (
                <p className="muted-state">
                  ยังไม่มีประวัติการจ่ายหรือยกเลิกในเดือนนี้
                </p>
              ) : (
                <ul className="dashboard-list history-list">
                  {summary.history.map((item) => (
                    <HistoryItem
                      isPending={paymentMutation.isPending}
                      item={item}
                      key={item.id}
                      onRevert={(target) => {
                        if (
                          target.cardId &&
                          target.statementEndDate &&
                          window.confirm(
                            'ย้อนรอบบัตรนี้เป็นยังไม่จ่ายใช่หรือไม่',
                          )
                        ) {
                          paymentMutation.mutate({
                            cardId: target.cardId,
                            input: { status: 'unpaid' },
                            statementEndDate: target.statementEndDate,
                          })
                        }
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      ) : null}

      {paymentTarget?.cardId && paymentTarget.statementEndDate ? (
        <dialog
          aria-labelledby="statement-payment-title"
          className="statement-payment-dialog"
          onCancel={(event) => {
            if (paymentMutation.isPending) {
              event.preventDefault()
              return
            }
            setPaymentTarget(null)
            requestAnimationFrame(() => previousFocusRef.current?.focus())
          }}
          ref={paymentDialogRef}
        >
          <form
            className="form-dialog payment-dialog-sheet"
            onSubmit={(event) => {
              event.preventDefault()
              paymentMutation.mutate({
                cardId: paymentTarget.cardId!,
                input: { paidAmount, paidDate, status: 'paid' },
                statementEndDate: paymentTarget.statementEndDate!,
              })
            }}
          >
            <div className="payment-dialog-heading">
              <div>
                <p className="eyebrow">ชำระรอบบัตร</p>
                <h2 id="statement-payment-title">{paymentTarget.title}</h2>
              </div>
            </div>
            <p className="payment-dialog-description">
              {paymentTarget.context}
            </p>
            <label className="field">
              ยอดที่จ่าย (บาท)
              <input
                autoFocus
                autoComplete="off"
                inputMode="decimal"
                min="0.01"
                name="paidAmount"
                onChange={(event) => setPaidAmount(event.target.value)}
                required
                step="0.01"
                type="number"
                value={paidAmount}
              />
            </label>
            <label className="field">
              วันที่ชำระ
              <input
                autoComplete="off"
                name="paidDate"
                onChange={(event) => setPaidDate(event.target.value)}
                required
                type="date"
                value={paidDate}
              />
            </label>
            {paymentMutation.isError ? (
              <p className="form-error" role="alert">
                {paymentMutation.error.message}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  paymentMutation.reset()
                  setPaymentTarget(null)
                  requestAnimationFrame(() => previousFocusRef.current?.focus())
                }}
                type="button"
              >
                ยกเลิก
              </button>
              <button
                className="primary-button"
                disabled={paymentMutation.isPending}
                type="submit"
              >
                {paymentMutation.isPending
                  ? 'กำลังบันทึก…'
                  : 'บันทึกว่าจ่ายแล้ว'}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </main>
  )
}

function RecentTransactionItem({ item }: { readonly item: TransactionData }) {
  return (
    <li>
      <div className="dashboard-item-main">
        <strong>{item.description}</strong>
        <strong className={item.direction}>
          {item.direction === 'expense' ? '−' : '+'}
          {formatThbMinor(item.amountMinor)}
        </strong>
      </div>
      <div className="dashboard-item-meta">
        <span>
          {formatThaiDate(item.transactionDate)} · {item.categoryName} ·{' '}
          {item.direction === 'income' ? 'รายรับ' : 'รายจ่าย'}
        </span>
      </div>
    </li>
  )
}

function Metric({
  hint,
  label,
  tone,
  value,
}: {
  readonly hint?: string
  readonly label: string
  readonly tone: 'expense' | 'income' | 'negative' | 'primary'
  readonly value: string
}) {
  return (
    <article className={`surface dashboard-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{formatThbMinor(value)}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  )
}

function PayableItem({
  item,
  onPay,
}: {
  readonly item: DashboardPayableData
  readonly onPay: (item: DashboardPayableData) => void
}) {
  return (
    <li>
      <div className="dashboard-item-main">
        <div>
          <strong>{item.title}</strong>
        </div>
        <strong>{formatThbMinor(item.amountMinor)}</strong>
      </div>
      <div className="dashboard-item-meta">
        <span className={`source-badge is-${item.source}`}>{item.context}</span>
        <span className={`payable-status is-${item.status}`}>
          {item.status === 'overdue' ? (
            <>
              <span aria-hidden="true">△</span> เกินกำหนด
            </>
          ) : (
            'ยังไม่จ่าย'
          )}
        </span>
        <span className="dashboard-item-date">
          {item.source === 'credit_card_statement' && item.officialDueDate ? (
            <>
              <span>วางแผน {formatThaiDate(item.dueDate)}</span>
              <span>ครบกำหนด {formatThaiDate(item.officialDueDate)}</span>
            </>
          ) : (
            <span>กำหนด {formatThaiDate(item.dueDate)}</span>
          )}
        </span>
        {item.source === 'credit_card_statement' ? (
          <button
            className="small-button"
            onClick={() => onPay(item)}
            type="button"
          >
            บันทึกการจ่าย
          </button>
        ) : (
          <Link
            className="dashboard-item-link"
            to={
              item.source === 'installment'
                ? '/installments'
                : '/recurring-expenses'
            }
          >
            จัดการรายการ
          </Link>
        )}
      </div>
    </li>
  )
}

function HistoryItem({
  isPending,
  item,
  onRevert,
}: {
  readonly isPending: boolean
  readonly item: DashboardHistoryData
  readonly onRevert: (item: DashboardHistoryData) => void
}) {
  return (
    <li>
      <div className="dashboard-item-main">
        <div>
          <strong>{item.title}</strong>
        </div>
        <strong>{formatThbMinor(item.amountMinor)}</strong>
      </div>
      <div className="dashboard-item-meta">
        <span className={`source-badge is-${item.source}`}>{item.context}</span>
        <span className={`payable-status is-${item.status}`}>
          {item.status === 'paid' ? (
            <>
              <span aria-hidden="true">✓</span> จ่ายแล้ว
            </>
          ) : (
            'ยกเลิก'
          )}
        </span>
        <span>
          {item.status === 'paid' ? 'จ่าย' : 'ยกเลิก'}{' '}
          {formatThaiDate(item.date)}
        </span>
        {item.source === 'credit_card_statement' && item.status === 'paid' ? (
          <button
            className="text-button"
            disabled={isPending}
            onClick={() => onRevert(item)}
            type="button"
          >
            ย้อนเป็นยังไม่จ่าย
          </button>
        ) : null}
      </div>
    </li>
  )
}

function minorToDecimal(value: string) {
  const minor = BigInt(value)
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

function formatThaiPeriod(period: string) {
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(new Date(`${period}-01T00:00:00+07:00`))
}
