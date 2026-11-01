import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Modal } from '../app/Modal'
import {
  setCreditCardStatementPayment,
  type CreditCardStatementData,
} from '../app/api'
import { useAuthenticatedContext } from '../app/authenticated-context'
import {
  formatThaiDate,
  formatThbMinor,
  todayInBangkok,
} from './finance-format'

export function StatementDialog({
  statement,
  onClose,
  onSaved,
}: {
  readonly statement: CreditCardStatementData
  readonly onClose: () => void
  readonly onSaved: () => void
}) {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const minor = BigInt(statement.amountMinor)
  const [amount, setAmount] = useState(
    `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`,
  )
  const [date, setDate] = useState(todayInBangkok)
  const payment = useMutation({
    mutationFn: (status: 'paid' | 'unpaid') =>
      setCreditCardStatementPayment(
        session.csrfToken,
        statement.cardId,
        statement.statementEndDate,
        status === 'paid'
          ? {
              status,
              expectedAmountMinor: statement.amountMinor,
              paidAmount: amount,
              paidDate: date,
            }
          : { status },
      ),
    onError: async () => {
      await Promise.all(
        ['credit-card-statements', 'dashboard-summary'].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [queryKey] }),
        ),
      )
    },
    onSuccess: async () => {
      await Promise.all(
        [
          'credit-card-statements',
          'dashboard-summary',
          'installment-plans',
          'recurring-expenses',
        ].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [queryKey] }),
        ),
      )
      onSaved()
      onClose()
    },
  })
  return (
    <Modal
      labelledBy="statement-detail-title"
      onClose={() => {
        if (!payment.isPending) onClose()
      }}
    >
      <section className="form-dialog statement-detail">
        <div className="dialog-heading">
          <h2 id="statement-detail-title">บิล {statement.cardName}</h2>
          <button
            className="small-button"
            type="button"
            disabled={payment.isPending}
            onClick={onClose}
          >
            ปิด
          </button>
        </div>
        <p>
          รอบ {formatThaiDate(statement.statementStartDate)} –{' '}
          {formatThaiDate(statement.statementEndDate)}
        </p>
        <p>
          ครบกำหนด {formatThaiDate(statement.officialDueDate)} · ยอดบิล{' '}
          <strong>{formatThbMinor(statement.amountMinor)}</strong>
        </p>
        <details className="statement-detail-list">
          <summary>ดูรายการในบิล {statement.items.length} รายการ</summary>
          <ul className="statement-detail-items">
            {statement.items.map((item) => (
              <li key={`${item.source}:${item.id}`}>
                <div>
                  <strong>{item.description}</strong>
                  <span>{item.context}</span>
                  <small>
                    วันที่รายการ {formatThaiDate(item.transactionDate)}
                    {item.postingDate
                      ? ` · ธนาคารบันทึก ${formatThaiDate(item.postingDate)}`
                      : ''}
                  </small>
                </div>
                <strong>{formatThbMinor(item.amountMinor)}</strong>
              </li>
            ))}
          </ul>
        </details>
        {statement.status === 'paid' ? (
          <>
            <p>
              จ่ายแล้ว {formatThbMinor(statement.paidAmountMinor!)} เมื่อ{' '}
              {formatThaiDate(statement.paidDate!)}
            </p>
            <button
              className="secondary-button"
              type="button"
              disabled={payment.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'ย้อนบิลและรายการที่จ่ายพร้อมบิลนี้เป็นยังไม่จ่ายใช่หรือไม่',
                  )
                )
                  payment.mutate('unpaid')
              }}
            >
              ย้อนเป็นยังไม่จ่าย
            </button>
          </>
        ) : (
          <form
            className="transaction-form"
            onSubmit={(event) => {
              event.preventDefault()
              payment.mutate('paid')
            }}
          >
            <h3>บันทึกการจ่าย</h3>
            <label className="field">
              ยอดที่จ่าย (บาท)
              <input
                autoComplete="off"
                inputMode="decimal"
                required
                pattern="\d+(?:\.\d{1,2})?"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="field">
              วันที่ชำระ
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={payment.isPending}
              type="submit"
            >
              {payment.isPending ? 'กำลังบันทึก…' : 'บันทึกว่าจ่ายแล้ว'}
            </button>
          </form>
        )}
        {payment.isError ? (
          <p className="form-error" role="alert">
            {payment.error.message}
          </p>
        ) : null}
      </section>
    </Modal>
  )
}
