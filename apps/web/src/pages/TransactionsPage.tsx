import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import {
  cancelTransaction,
  correctTransaction,
  createTransaction,
  getCategories,
  getTransactions,
  type CategoryData,
  type Direction,
  type PaymentMethod,
  type TransactionData,
  type TransactionFilters,
  type TransactionInput,
} from '../app/api'
import { useAuthenticatedContext } from '../app/authenticated-context'
import { formatThbMinor } from './finance-format'

const transactionSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,3})?$/, 'กรุณาระบุจำนวนเงินให้ถูกต้อง'),
  categoryId: z.string().min(1, 'กรุณาเลือกหมวดหมู่'),
  description: z.string().trim().min(1, 'กรุณาระบุรายละเอียด').max(255),
  direction: z.enum(['income', 'expense']),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'debit_card', 'other']),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณาเลือกวันที่'),
})

const paymentLabels: Record<PaymentMethod | 'credit_card', string> = {
  bank_transfer: 'โอนเงิน',
  cash: 'เงินสด',
  credit_card: 'บัตรเครดิต',
  debit_card: 'บัตรเดบิต',
  other: 'อื่น ๆ',
}

type TransactionFormValues = z.infer<typeof transactionSchema>

export function TransactionsPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const quickAddRequested = searchParams.get('action') === 'new'
  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    pageSize: 25,
    status: 'active',
  })
  const [formTarget, setFormTarget] = useState<TransactionData | 'new' | null>(
    null,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const categoriesQuery = useQuery({
    queryFn: getCategories,
    queryKey: ['categories'],
  })
  const transactionsQuery = useQuery({
    queryFn: () => getTransactions(filters),
    queryKey: ['transactions', filters],
  })
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelTransaction(session.csrfToken, id),
    onSuccess: async () => {
      setNotice('ยกเลิกรายการแล้ว ประวัติยังคงอยู่')
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  const transactions = transactionsQuery.data?.items ?? []
  const categories = categoriesQuery.data ?? []
  const activeFormTarget = formTarget ?? (quickAddRequested ? 'new' : null)

  const closeForm = useCallback(() => {
    setFormTarget(null)
    if (!quickAddRequested) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('action')
    setSearchParams(nextParams, { replace: true })
  }, [quickAddRequested, searchParams, setSearchParams])

  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  return (
    <main className="page-shell">
      <header className="page-header page-header-actions">
        <div>
          <p className="eyebrow">กิจกรรมการเงิน</p>
          <h1>รายรับและรายจ่าย</h1>
          <p>บันทึกตามวันที่เกิดรายการ โดยยังไม่รวมยอดชำระบัตรเครดิต</p>
        </div>
        <button
          className="primary-button action-button"
          onClick={() => setFormTarget('new')}
          type="button"
        >
          เพิ่มรายการ
        </button>
      </header>

      <TransactionFilterBar
        categories={categories}
        filters={filters}
        onApply={(next) => setFilters({ ...next, page: 1, pageSize: 25 })}
      />

      {notice ? (
        <div className="action-notice" role="status">
          <span>{notice}</span>
          <button
            aria-label="ปิดข้อความ"
            onClick={() => setNotice(null)}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
      {cancelMutation.isError ? (
        <p className="inline-error" role="alert">
          {cancelMutation.error.message}
        </p>
      ) : null}

      <section
        className="surface transaction-surface"
        aria-label="รายการการเงิน"
      >
        {transactionsQuery.isPending || categoriesQuery.isPending ? (
          <p className="muted-state" aria-busy="true">
            กำลังโหลดรายการ…
          </p>
        ) : transactionsQuery.isError || categoriesQuery.isError ? (
          <p className="inline-error" role="alert">
            {transactionsQuery.error?.message ?? categoriesQuery.error?.message}
          </p>
        ) : transactions.length === 0 ? (
          <div className="empty-list">
            <h2>ยังไม่มีรายการ</h2>
            <p>เพิ่มรายรับหรือรายจ่ายรายการแรกเพื่อเริ่มต้น</p>
          </div>
        ) : (
          <>
            <TransactionTable
              items={transactions}
              onCancel={(item) => {
                if (
                  window.confirm(
                    `ยกเลิก “${item.description}” ใช่หรือไม่ ประวัติรายการจะยังคงอยู่`,
                  )
                ) {
                  cancelMutation.mutate(item.id)
                }
              }}
              onCorrect={setFormTarget}
            />
            <TransactionCards
              items={transactions}
              onCancel={(item) => {
                if (
                  window.confirm(
                    `ยกเลิก “${item.description}” ใช่หรือไม่ ประวัติรายการจะยังคงอยู่`,
                  )
                ) {
                  cancelMutation.mutate(item.id)
                }
              }}
              onCorrect={setFormTarget}
            />
          </>
        )}

        <div className="pagination-row">
          <button
            className="small-button"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                page: Math.max(1, (current.page ?? 1) - 1),
              }))
            }
            type="button"
          >
            ก่อนหน้า
          </button>
          <span>หน้า {filters.page ?? 1}</span>
          <button
            className="small-button"
            disabled={!transactionsQuery.data?.nextPage}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                page: transactionsQuery.data?.nextPage ?? current.page,
              }))
            }
            type="button"
          >
            ถัดไป
          </button>
        </div>
      </section>

      {activeFormTarget ? (
        <TransactionFormDialog
          categories={categories}
          onClose={closeForm}
          onSaved={async () => {
            setNotice(
              activeFormTarget === 'new'
                ? 'บันทึกรายการแล้ว'
                : 'แก้ไขรายการแล้ว พร้อมเก็บประวัติเดิม',
            )
            closeForm()
            await queryClient.invalidateQueries({ queryKey: ['transactions'] })
          }}
          sessionCsrfToken={session.csrfToken}
          target={activeFormTarget}
        />
      ) : null}
    </main>
  )
}

function TransactionFilterBar({
  categories,
  filters,
  onApply,
}: {
  readonly categories: readonly CategoryData[]
  readonly filters: TransactionFilters
  readonly onApply: (filters: TransactionFilters) => void
}) {
  const [draft, setDraft] = useState(filters)

  return (
    <form
      className="surface filter-bar"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(draft)
      }}
    >
      <label>
        ค้นหา
        <input
          onChange={(event) =>
            setDraft((current) => ({ ...current, search: event.target.value }))
          }
          placeholder="รายละเอียดรายการ"
          type="search"
          value={draft.search ?? ''}
        />
      </label>
      <label>
        ประเภท
        <select
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              direction: (event.target.value || undefined) as
                Direction | undefined,
            }))
          }
          value={draft.direction ?? ''}
        >
          <option value="">ทั้งหมด</option>
          <option value="expense">รายจ่าย</option>
          <option value="income">รายรับ</option>
        </select>
      </label>
      <label>
        หมวดหมู่
        <select
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              categoryId: event.target.value || undefined,
            }))
          }
          value={draft.categoryId ?? ''}
        >
          <option value="">ทั้งหมด</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        สถานะ
        <select
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              status: event.target.value as TransactionFilters['status'],
            }))
          }
          value={draft.status ?? 'active'}
        >
          <option value="active">ใช้งาน</option>
          <option value="cancelled">ยกเลิก</option>
          <option value="superseded">ถูกแก้ไข</option>
          <option value="all">ทั้งหมด</option>
        </select>
      </label>
      <label>
        วิธีชำระ
        <select
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              paymentMethod: (event.target.value || undefined) as
                PaymentMethod | undefined,
            }))
          }
          value={draft.paymentMethod ?? ''}
        >
          <option value="">ทั้งหมด</option>
          {(
            Object.entries(paymentLabels) as [
              PaymentMethod | 'credit_card',
              string,
            ][]
          )
            .filter(([method]) => method !== 'credit_card')
            .map(([method, label]) => (
              <option key={method} value={method}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <label>
        ตั้งแต่วันที่
        <input
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              dateFrom: event.target.value || undefined,
            }))
          }
          type="date"
          value={draft.dateFrom ?? ''}
        />
      </label>
      <label>
        ถึงวันที่
        <input
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              dateTo: event.target.value || undefined,
            }))
          }
          type="date"
          value={draft.dateTo ?? ''}
        />
      </label>
      <button className="secondary-button" type="submit">
        กรองรายการ
      </button>
    </form>
  )
}

function TransactionFormDialog({
  categories,
  onClose,
  onSaved,
  sessionCsrfToken,
  target,
}: {
  readonly categories: readonly CategoryData[]
  readonly onClose: () => void
  readonly onSaved: () => Promise<void>
  readonly sessionCsrfToken: string
  readonly target: TransactionData | 'new'
}) {
  const isCorrection = target !== 'new'
  const defaults = useMemo<TransactionFormValues>(
    () =>
      target === 'new'
        ? {
            amount: '',
            categoryId: '',
            description: '',
            direction: 'expense',
            paymentMethod: 'cash',
            transactionDate: todayInBangkok(),
          }
        : {
            amount: minorToInput(target.amountMinor),
            categoryId: target.categoryId,
            description: target.description,
            direction: target.direction,
            paymentMethod:
              target.paymentMethod === 'credit_card'
                ? 'other'
                : target.paymentMethod,
            transactionDate: target.transactionDate,
          },
    [target],
  )
  const form = useForm<TransactionFormValues>({
    defaultValues: defaults,
    resolver: zodResolver(transactionSchema),
  })
  const direction = useWatch({ control: form.control, name: 'direction' })
  const availableCategories = categories.filter(
    (category) =>
      category.direction === direction &&
      (category.isActive ||
        (target !== 'new' && category.id === target.categoryId)),
  )
  const saveMutation = useMutation({
    mutationFn: (input: TransactionInput) =>
      target === 'new'
        ? createTransaction(sessionCsrfToken, input)
        : correctTransaction(sessionCsrfToken, target.id, input),
    onSuccess: onSaved,
  })
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="transaction-form-title"
        aria-modal="true"
        className="form-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {isCorrection ? 'แก้ไขโดยเก็บประวัติ' : 'รายการใหม่'}
            </p>
            <h2 id="transaction-form-title">
              {isCorrection ? 'แก้ไขรายการ' : 'เพิ่มรายรับหรือรายจ่าย'}
            </h2>
          </div>
          <button
            aria-label="ปิด"
            className="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </div>

        <form
          className="transaction-form"
          onSubmit={(event) => {
            void form.handleSubmit((values) => saveMutation.mutate(values))(
              event,
            )
          }}
        >
          <fieldset className="segmented-field">
            <legend>ประเภท</legend>
            <label>
              <input
                type="radio"
                value="expense"
                {...form.register('direction', {
                  onChange: () => form.setValue('categoryId', ''),
                })}
              />
              รายจ่าย
            </label>
            <label>
              <input
                type="radio"
                value="income"
                {...form.register('direction', {
                  onChange: () => form.setValue('categoryId', ''),
                })}
              />
              รายรับ
            </label>
          </fieldset>

          <label className="field">
            จำนวนเงิน (บาท)
            <input
              aria-invalid={Boolean(form.formState.errors.amount)}
              inputMode="decimal"
              placeholder="0.00"
              {...form.register('amount')}
            />
            {form.formState.errors.amount ? (
              <small>{form.formState.errors.amount.message}</small>
            ) : null}
          </label>
          <label className="field">
            วันที่รายการ
            <input type="date" {...form.register('transactionDate')} />
            {form.formState.errors.transactionDate ? (
              <small>{form.formState.errors.transactionDate.message}</small>
            ) : null}
          </label>
          <label className="field">
            รายละเอียด
            <input autoComplete="off" {...form.register('description')} />
            {form.formState.errors.description ? (
              <small>{form.formState.errors.description.message}</small>
            ) : null}
          </label>
          <label className="field">
            หมวดหมู่
            <select {...form.register('categoryId')}>
              <option value="">เลือกหมวดหมู่</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isActive ? '' : ' (ปิดใช้งาน)'}
                </option>
              ))}
            </select>
            {form.formState.errors.categoryId ? (
              <small>{form.formState.errors.categoryId.message}</small>
            ) : null}
          </label>
          <label className="field">
            วิธีชำระ
            <select {...form.register('paymentMethod')}>
              {(
                Object.entries(paymentLabels) as [
                  PaymentMethod | 'credit_card',
                  string,
                ][]
              )
                .filter(([method]) => method !== 'credit_card')
                .map(([method, label]) => (
                  <option key={method} value={method}>
                    {label}
                  </option>
                ))}
            </select>
          </label>

          {saveMutation.isError ? (
            <p className="form-error" role="alert">
              {saveMutation.error.message}
            </p>
          ) : null}

          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={onClose}
              type="button"
            >
              ยกเลิก
            </button>
            <button
              className="primary-button"
              disabled={saveMutation.isPending}
              type="submit"
            >
              {saveMutation.isPending
                ? 'กำลังบันทึก…'
                : isCorrection
                  ? 'ยืนยันการแก้ไข'
                  : 'บันทึกรายการ'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function TransactionTable({
  items,
  onCancel,
  onCorrect,
}: TransactionListProps) {
  return (
    <div className="desktop-transaction-table">
      <table>
        <thead>
          <tr>
            <th>วันที่</th>
            <th>รายละเอียด</th>
            <th>หมวดหมู่</th>
            <th>วิธีชำระ</th>
            <th>สถานะ</th>
            <th className="amount-cell">จำนวนเงิน</th>
            <th aria-label="การทำงาน" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{formatThaiDate(item.transactionDate)}</td>
              <td>{item.description}</td>
              <td>{item.categoryName}</td>
              <td>{paymentLabels[item.paymentMethod]}</td>
              <td>
                <StatusLabel status={item.status} />
              </td>
              <td className={`amount-cell ${item.direction}`}>
                {item.direction === 'expense' ? '−' : '+'}
                {formatThbMinor(item.amountMinor)}
              </td>
              <td>
                <TransactionActions
                  item={item}
                  onCancel={onCancel}
                  onCorrect={onCorrect}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TransactionCards({
  items,
  onCancel,
  onCorrect,
}: TransactionListProps) {
  return (
    <div className="mobile-transaction-cards">
      {items.map((item) => (
        <article className="transaction-card" key={item.id}>
          <div className="transaction-card-main">
            <div>
              <h2>{item.description}</h2>
              <p>
                {formatThaiDate(item.transactionDate)} · {item.categoryName}
              </p>
            </div>
            <strong className={item.direction}>
              {item.direction === 'expense' ? '−' : '+'}
              {formatThbMinor(item.amountMinor)}
            </strong>
          </div>
          <div className="transaction-card-meta">
            <span>{paymentLabels[item.paymentMethod]}</span>
            <StatusLabel status={item.status} />
            <TransactionActions
              item={item}
              onCancel={onCancel}
              onCorrect={onCorrect}
            />
          </div>
        </article>
      ))}
    </div>
  )
}

interface TransactionListProps {
  readonly items: readonly TransactionData[]
  readonly onCancel: (item: TransactionData) => void
  readonly onCorrect: (item: TransactionData) => void
}

function TransactionActions({
  item,
  onCancel,
  onCorrect,
}: Omit<TransactionListProps, 'items'> & { readonly item: TransactionData }) {
  if (item.status !== 'active') return null
  return (
    <div className="row-actions">
      <button
        className="text-button"
        onClick={() => onCorrect(item)}
        type="button"
      >
        แก้ไข
      </button>
      <button
        className="text-button danger"
        onClick={() => onCancel(item)}
        type="button"
      >
        ยกเลิก
      </button>
    </div>
  )
}

function StatusLabel({
  status,
}: {
  readonly status: TransactionData['status']
}) {
  const labels = {
    active: 'ใช้งาน',
    cancelled: 'ยกเลิก',
    superseded: 'ถูกแก้ไข',
  }
  return <span className={`status-label ${status}`}>{labels[status]}</span>
}

function minorToInput(value: string): string {
  const minor = BigInt(value)
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00+07:00`))
}

function todayInBangkok(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(new Date())
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )
  return `${values.year}-${values.month}-${values.day}`
}
