import { QueryError } from '../app/QueryError'
import { type ChangeEvent, useCallback, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import {
  cancelTransaction,
  correctTransaction,
  createTransaction,
  getCategories,
  getCreditCards,
  getTransactions,
  type CategoryData,
  type CreditCardData,
  type PaymentMethod,
  type TransactionData,
  type TransactionFilters,
  type TransactionInput,
} from '../app/api'
import { Modal } from '../app/Modal'
import { ActionNotice } from '../app/ActionNotice'
import { useAuthenticatedContext } from '../app/authenticated-context'
import {
  formatThaiDate,
  formatThbMinor,
  todayInBangkok,
} from './finance-format'

const transactionSchema = z
  .object({
    amount: z
      .string()
      .trim()
      .regex(/^\d+(?:\.\d{1,3})?$/, 'กรุณาระบุจำนวนเงินให้ถูกต้อง'),
    categoryId: z.string().min(1, 'กรุณาเลือกหมวดหมู่'),
    creditCardId: z.string().optional(),
    description: z.string().trim().min(1, 'กรุณาระบุรายละเอียด').max(255),
    direction: z.enum(['income', 'expense']),
    paymentMethod: z.enum([
      'cash',
      'bank_transfer',
      'debit_card',
      'other',
      'credit_card',
    ]),
    transactionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณาเลือกวันที่'),
  })
  .refine(
    ({ creditCardId, paymentMethod }) =>
      paymentMethod !== 'credit_card' || Boolean(creditCardId),
    { message: 'กรุณาเลือกบัตรเครดิต', path: ['creditCardId'] },
  )

const paymentLabels: Record<PaymentMethod, string> = {
  bank_transfer: 'โอนเงิน',
  cash: 'เงินสด',
  credit_card: 'บัตรเครดิต',
  debit_card: 'บัตรเดบิต',
  other: 'อื่น ๆ',
}

const defaultTransactionFilters: TransactionFilters = {
  page: 1,
  pageSize: 25,
  status: 'active',
}

const transactionStatusLabels = {
  active: 'ใช้งาน',
  all: 'ทุกสถานะ',
  cancelled: 'ยกเลิก',
  superseded: 'ถูกแก้ไข',
} as const

type TransactionFormValues = z.infer<typeof transactionSchema>

export function TransactionsPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const quickAddFromPage = useLocation().state === 'quick-add'
  const [searchParams, setSearchParams] = useSearchParams()
  const quickAddRequested = searchParams.get('action') === 'new'
  const [filters, setFilters] = useState<TransactionFilters>(
    defaultTransactionFilters,
  )
  const [formTarget, setFormTarget] = useState<TransactionData | 'new' | null>(
    null,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const categoriesQuery = useQuery({
    queryFn: getCategories,
    queryKey: ['categories'],
  })
  const creditCardsQuery = useQuery({
    queryFn: getCreditCards,
    queryKey: ['credit-cards'],
  })
  const transactionsQuery = useQuery({
    queryFn: () => getTransactions(filters),
    queryKey: ['transactions', filters],
  })
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelTransaction(session.csrfToken, id),
    onSuccess: async () => {
      setNotice('ยกเลิกรายการแล้ว ประวัติยังคงอยู่')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['credit-card-statements'] }),
      ])
    },
  })

  const transactions = transactionsQuery.data?.items ?? []
  const categories = categoriesQuery.data ?? []
  const creditCards = creditCardsQuery.data ?? []
  const activeFormTarget = formTarget ?? (quickAddRequested ? 'new' : null)

  const closeForm = useCallback(() => {
    setFormTarget(null)
    if (!quickAddRequested) return
    if (quickAddFromPage) {
      void navigate(-1)
      return
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('action')
    setSearchParams(nextParams, { replace: true })
  }, [
    navigate,
    quickAddFromPage,
    quickAddRequested,
    searchParams,
    setSearchParams,
  ])

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">กิจกรรมการเงิน</p>
          <h1>รายรับและรายจ่าย</h1>
          <p>บันทึกตามวันที่เกิดรายการ โดยยังไม่รวมยอดชำระบัตรเครดิต</p>
        </div>
      </header>

      <TransactionFilterBar
        categories={categories}
        creditCards={creditCards}
        filters={filters}
        onApply={(next) => setFilters({ ...next, page: 1, pageSize: 25 })}
      />

      <ActionNotice message={notice} setMessage={setNotice} />
      {cancelMutation.isError ? (
        <p className="inline-error" role="alert">
          {cancelMutation.error.message}
        </p>
      ) : null}

      <section
        className="surface transaction-surface"
        aria-label="รายการการเงิน"
      >
        {transactionsQuery.isPending ||
        categoriesQuery.isPending ||
        creditCardsQuery.isPending ? (
          <p className="muted-state" aria-busy="true" role="status">
            กำลังโหลดรายการ…
          </p>
        ) : transactionsQuery.isError ||
          categoriesQuery.isError ||
          creditCardsQuery.isError ? (
          <QueryError
            message={
              transactionsQuery.error?.message ??
              categoriesQuery.error?.message ??
              creditCardsQuery.error?.message ??
              'โหลดข้อมูลไม่สำเร็จ'
            }
            onRetry={() => {
              void Promise.all([
                transactionsQuery.refetch(),
                categoriesQuery.refetch(),
                creditCardsQuery.refetch(),
              ])
            }}
          />
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
          creditCards={creditCards}
          onClose={closeForm}
          onSaved={async () => {
            setNotice(
              activeFormTarget === 'new'
                ? 'บันทึกรายการแล้ว'
                : 'แก้ไขรายการแล้ว พร้อมเก็บประวัติเดิม',
            )
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['transactions'] }),
              queryClient.invalidateQueries({
                queryKey: ['dashboard-summary'],
              }),
              queryClient.invalidateQueries({
                queryKey: ['credit-card-statements'],
              }),
            ])
            closeForm()
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
  creditCards,
  filters,
  onApply,
}: {
  readonly categories: readonly CategoryData[]
  readonly creditCards: readonly CreditCardData[]
  readonly filters: TransactionFilters
  readonly onApply: (filters: TransactionFilters) => void
}) {
  const [draft, setDraft] = useState(filters)
  const appliedConditions = describeFilters(filters, categories, creditCards)
  const additionalFilterCount = countAdditionalFilters(filters)

  const apply = (next: TransactionFilters) => {
    setDraft(next)
    onApply(next)
  }

  return (
    <form
      className="surface filter-bar"
      onSubmit={(event) => {
        event.preventDefault()
        apply(draft)
      }}
    >
      <label className="transaction-search-filter">
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
      <fieldset className="transaction-type-filter">
        <legend>ประเภท</legend>
        <div>
          {(
            [
              ['', 'ทั้งหมด'],
              ['income', 'รายรับ'],
              ['expense', 'รายจ่าย'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                checked={(draft.direction ?? '') === value}
                name="transaction-direction-filter"
                onChange={() =>
                  setDraft((current) => ({
                    ...current,
                    direction: value || undefined,
                  }))
                }
                type="radio"
                value={value}
              />
              <span aria-hidden="true">✓</span>
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <details className="additional-filters">
        <summary>ตัวกรองเพิ่มเติม · {additionalFilterCount}</summary>
        <div className="additional-filter-grid">
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
              {(Object.entries(paymentLabels) as [PaymentMethod, string][]).map(
                ([method, label]) => (
                  <option key={method} value={method}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            บัตรเครดิต
            <select
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  creditCardId: event.target.value || undefined,
                }))
              }
              value={draft.creditCardId ?? ''}
            >
              <option value="">ทั้งหมด</option>
              {creditCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {formatCardName(card)}
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
        </div>
      </details>

      <div className="filter-actions">
        <button
          className="secondary-button"
          onClick={() => apply(defaultTransactionFilters)}
          type="button"
        >
          ล้างตัวกรอง
        </button>
        <button className="primary-button" type="submit">
          กรองรายการ
        </button>
      </div>

      <p className="applied-filters" aria-live="polite">
        <strong>เงื่อนไขที่ใช้ · {appliedConditions.length}</strong>
        <span>{appliedConditions.join(' · ')}</span>
      </p>
    </form>
  )
}

function countAdditionalFilters(filters: TransactionFilters) {
  return [
    filters.categoryId,
    filters.creditCardId,
    filters.dateFrom,
    filters.dateTo,
    filters.paymentMethod,
    filters.status ?? 'active',
  ].filter(Boolean).length
}

function describeFilters(
  filters: TransactionFilters,
  categories: readonly CategoryData[],
  creditCards: readonly CreditCardData[],
) {
  const descriptions: string[] = []
  if (filters.search) descriptions.push(`ค้นหา “${filters.search}”`)
  if (filters.direction)
    descriptions.push(filters.direction === 'income' ? 'รายรับ' : 'รายจ่าย')
  if (filters.categoryId)
    descriptions.push(
      categories.find(({ id }) => id === filters.categoryId)?.name ??
        'หมวดหมู่ที่เลือก',
    )
  descriptions.push(transactionStatusLabels[filters.status ?? 'active'])
  if (filters.paymentMethod)
    descriptions.push(paymentLabels[filters.paymentMethod])
  if (filters.creditCardId)
    descriptions.push(
      formatCardName(
        creditCards.find(({ id }) => id === filters.creditCardId) ?? {
          maskedSuffix: null,
          name: 'บัตรที่เลือก',
        },
      ),
    )
  if (filters.dateFrom)
    descriptions.push(`ตั้งแต่ ${formatThaiDate(filters.dateFrom)}`)
  if (filters.dateTo) descriptions.push(`ถึง ${formatThaiDate(filters.dateTo)}`)
  return descriptions
}

function TransactionFormDialog({
  categories,
  creditCards,
  onClose,
  onSaved,
  sessionCsrfToken,
  target,
}: {
  readonly categories: readonly CategoryData[]
  readonly creditCards: readonly CreditCardData[]
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
            creditCardId: '',
            description: '',
            direction: 'expense',
            paymentMethod: 'cash',
            transactionDate: todayInBangkok(),
          }
        : {
            amount: minorToInput(target.amountMinor),
            categoryId: target.categoryId,
            creditCardId: target.creditCardId ?? '',
            description: target.description,
            direction: target.direction,
            paymentMethod: target.paymentMethod,
            transactionDate: target.transactionDate,
          },
    [target],
  )
  const form = useForm<TransactionFormValues>({
    defaultValues: defaults,
    resolver: zodResolver(transactionSchema),
  })
  const direction = useWatch({ control: form.control, name: 'direction' })
  const paymentMethod = useWatch({
    control: form.control,
    name: 'paymentMethod',
  })
  const availableCategories = categories.filter(
    (category) =>
      category.direction === direction &&
      (category.isActive ||
        (target !== 'new' && category.id === target.categoryId)),
  )
  const availableCreditCards = creditCards.filter(
    (card) =>
      card.isActive || (target !== 'new' && card.id === target.creditCardId),
  )
  const saveMutation = useMutation({
    mutationFn: (input: TransactionInput) => {
      const normalizedInput = {
        ...input,
        creditCardId: input.creditCardId || null,
      }
      return target === 'new'
        ? createTransaction(sessionCsrfToken, normalizedInput)
        : correctTransaction(sessionCsrfToken, target.id, normalizedInput)
    },
    onSuccess: onSaved,
  })

  return (
    <Modal labelledBy="transaction-form-title" onClose={onClose}>
      <section aria-labelledby="transaction-form-title" className="form-dialog">
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
                  onChange: () => {
                    form.setValue('categoryId', '')
                    form.setValue('creditCardId', '')
                  },
                })}
              />
              รายจ่าย
            </label>
            <label>
              <input
                type="radio"
                value="income"
                {...form.register('direction', {
                  onChange: () => {
                    form.setValue('categoryId', '')
                    form.setValue('creditCardId', '')
                    form.setValue('paymentMethod', 'cash')
                  },
                })}
              />
              รายรับ
            </label>
          </fieldset>

          <label className="field">
            จำนวนเงิน (บาท)
            <input
              aria-invalid={Boolean(form.formState.errors.amount)}
              aria-describedby={
                form.formState.errors.amount
                  ? 'TransactionsPage-amount-error'
                  : undefined
              }
              inputMode="decimal"
              placeholder="0.00"
              {...form.register('amount')}
            />
            {form.formState.errors.amount ? (
              <small id="TransactionsPage-amount-error" role="alert">
                {form.formState.errors.amount.message}
              </small>
            ) : null}
          </label>
          <label className="field">
            วันที่รายการ
            <input
              aria-invalid={Boolean(form.formState.errors.transactionDate)}
              aria-describedby={
                form.formState.errors.transactionDate
                  ? 'TransactionsPage-transactionDate-error'
                  : undefined
              }
              type="date"
              {...form.register('transactionDate')}
            />
            {form.formState.errors.transactionDate ? (
              <small id="TransactionsPage-transactionDate-error" role="alert">
                {form.formState.errors.transactionDate.message}
              </small>
            ) : null}
          </label>
          <label className="field">
            รายละเอียด
            <input
              aria-invalid={Boolean(form.formState.errors.description)}
              aria-describedby={
                form.formState.errors.description
                  ? 'TransactionsPage-description-error'
                  : undefined
              }
              autoComplete="off"
              {...form.register('description')}
            />
            {form.formState.errors.description ? (
              <small id="TransactionsPage-description-error" role="alert">
                {form.formState.errors.description.message}
              </small>
            ) : null}
          </label>
          <label className="field">
            หมวดหมู่
            <select
              aria-invalid={Boolean(form.formState.errors.categoryId)}
              aria-describedby={
                form.formState.errors.categoryId
                  ? 'TransactionsPage-categoryId-error'
                  : undefined
              }
              {...form.register('categoryId')}
            >
              <option value="">เลือกหมวดหมู่</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isActive ? '' : ' (ปิดใช้งาน)'}
                </option>
              ))}
            </select>
            {form.formState.errors.categoryId ? (
              <small id="TransactionsPage-categoryId-error" role="alert">
                {form.formState.errors.categoryId.message}
              </small>
            ) : null}
          </label>
          <label className="field">
            วิธีชำระ
            <select
              {...form.register('paymentMethod', {
                onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                  if (event.target.value !== 'credit_card') {
                    form.setValue('creditCardId', '')
                  }
                },
              })}
            >
              {(Object.entries(paymentLabels) as [PaymentMethod, string][])
                .filter(
                  ([method]) =>
                    direction === 'expense' || method !== 'credit_card',
                )
                .map(([method, label]) => (
                  <option key={method} value={method}>
                    {label}
                  </option>
                ))}
            </select>
          </label>

          {paymentMethod === 'credit_card' ? (
            <label className="field">
              บัตรเครดิต
              <select
                aria-invalid={Boolean(form.formState.errors.creditCardId)}
                aria-describedby={
                  form.formState.errors.creditCardId
                    ? 'TransactionsPage-creditCardId-error'
                    : undefined
                }
                {...form.register('creditCardId')}
              >
                <option value="">เลือกบัตรเครดิต</option>
                {availableCreditCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {formatCardName(card)}
                    {card.isActive ? '' : ' (ปิดใช้งาน)'}
                  </option>
                ))}
              </select>
              {form.formState.errors.creditCardId ? (
                <small id="TransactionsPage-creditCardId-error" role="alert">
                  {form.formState.errors.creditCardId.message}
                </small>
              ) : null}
            </label>
          ) : null}

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
    </Modal>
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
        <caption className="sr-only">รายการรายรับและรายจ่าย</caption>
        <thead>
          <tr>
            <th>วันที่</th>
            <th>รายละเอียดและหมวดหมู่</th>
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
              <td>
                <strong>{item.description}</strong>
                <span>
                  {item.direction === 'expense' ? 'รายจ่าย' : 'รายรับ'} ·{' '}
                  {item.categoryName}
                </span>
              </td>
              <td>{formatPayment(item)}</td>
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
            <h2>{item.description}</h2>
            <strong className={item.direction}>
              {item.direction === 'expense' ? '−' : '+'}
              {formatThbMinor(item.amountMinor)}
            </strong>
          </div>
          <p className="transaction-card-meta">
            {item.direction === 'expense' ? 'รายจ่าย' : 'รายรับ'} ·{' '}
            {item.categoryName} · {formatPayment(item)}
          </p>
          <div className="transaction-card-status">
            <span>{formatThaiDate(item.transactionDate)}</span>
            <StatusLabel status={item.status} />
          </div>
          {item.status === 'active' ? (
            <TransactionActions
              item={item}
              onCancel={onCancel}
              onCorrect={onCorrect}
            />
          ) : null}
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
        aria-label={`แก้ไขรายการ ${item.description}`}
        className="text-button"
        onClick={() => onCorrect(item)}
        type="button"
      >
        แก้ไข
      </button>
      <button
        aria-label={`ยกเลิกรายการ ${item.description}`}
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

function formatCardName(card: Pick<CreditCardData, 'maskedSuffix' | 'name'>) {
  return card.maskedSuffix
    ? `${card.name} •••• ${card.maskedSuffix}`
    : card.name
}

function formatPayment(item: TransactionData): string {
  return item.paymentMethod === 'credit_card' && item.creditCardName
    ? `บัตรเครดิต · ${formatCardName({ maskedSuffix: item.creditCardMaskedSuffix, name: item.creditCardName })}`
    : paymentLabels[item.paymentMethod]
}
