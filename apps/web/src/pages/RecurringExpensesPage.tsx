import { QueryError } from '../app/QueryError'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { Modal } from '../app/Modal'
import { Icon } from '../app/Icon'
import { ActionNotice } from '../app/ActionNotice'
import {
  createRecurringExpense,
  getCategories,
  getCreditCards,
  getRecurringExpenses,
  setRecurringExpenseStatus,
  stopRecurringExpense,
  updateRecurringExpense,
  type PaymentMethod,
  type RecurringExpenseData,
  type RecurringOccurrenceData,
} from '../app/api'
import { useAuthenticatedContext } from '../app/authenticated-context'
import {
  formatThaiDate,
  formatThbMinor,
  todayInBangkok,
} from './finance-format'

const formSchema = z
  .object({
    amount: z
      .string()
      .regex(/^\d+(?:\.\d{1,2})?$/, 'ระบุจำนวนเงินไม่เกิน 2 ตำแหน่ง'),
    categoryId: z.string().min(1, 'กรุณาเลือกหมวดรายจ่าย'),
    creditCardId: z.string(),
    description: z.string().trim().min(1, 'กรุณาระบุชื่อรายการ').max(255),
    paymentMethod: z.enum([
      'cash',
      'bank_transfer',
      'debit_card',
      'other',
      'credit_card',
    ]),
    recurrenceDay: z.number().int().min(1).max(31),
    startDate: z.string().min(1, 'กรุณาระบุวันเริ่มต้น'),
  })
  .refine(
    ({ creditCardId, paymentMethod }) =>
      paymentMethod !== 'credit_card' || Boolean(creditCardId),
    { message: 'กรุณาเลือกบัตรเครดิต', path: ['creditCardId'] },
  )

type FormValues = z.infer<typeof formSchema>

const paymentLabels: Record<PaymentMethod, string> = {
  bank_transfer: 'โอนเงิน',
  cash: 'เงินสด',
  credit_card: 'บัตรเครดิต',
  debit_card: 'บัตรเดบิต',
  other: 'อื่น ๆ',
}

export function RecurringExpensesPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const idempotencyKey = useRef(crypto.randomUUID())
  const [editing, setEditing] = useState<RecurringExpenseData | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingPayment, setPendingPayment] = useState<{
    occurrence: RecurringOccurrenceData
    rule: RecurringExpenseData
  } | null>(null)
  const [stopping, setStopping] = useState<RecurringExpenseData | null>(null)
  const form = useForm<FormValues>({
    defaultValues: emptyForm(),
    resolver: zodResolver(formSchema),
  })
  const paymentMethod = useWatch({
    control: form.control,
    name: 'paymentMethod',
  })
  const categoriesQuery = useQuery({
    queryFn: getCategories,
    queryKey: ['categories'],
  })
  const cardsQuery = useQuery({
    queryFn: getCreditCards,
    queryKey: ['credit-cards'],
  })
  const rulesQuery = useQuery({
    queryFn: () => getRecurringExpenses(session.csrfToken),
    queryKey: ['recurring-expenses'],
  })

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const input = {
        amount: values.amount,
        categoryId: values.categoryId,
        ...(values.paymentMethod === 'credit_card' && values.creditCardId
          ? { creditCardId: values.creditCardId }
          : {}),
        description: values.description,
        paymentMethod: values.paymentMethod,
        recurrenceDay: values.recurrenceDay,
        startDate: values.startDate,
      }
      return editing
        ? updateRecurringExpense(session.csrfToken, editing.id, input)
        : createRecurringExpense(session.csrfToken, {
            ...input,
            idempotencyKey: idempotencyKey.current,
          })
    },
    onSuccess: async () => {
      const wasEditing = Boolean(editing)
      idempotencyKey.current = crypto.randomUUID()
      setIsFormOpen(false)
      setEditing(null)
      form.reset(emptyForm())
      setNotice(
        wasEditing ? 'แก้ไขงวดปัจจุบันและอนาคตแล้ว' : 'สร้างรายการประจำแล้ว',
      )
      await queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
    },
  })
  const paymentMutation = useMutation({
    mutationFn: ({
      amount,
      date,
      occurrence,
      rule,
      status,
    }: {
      amount?: string
      date?: string
      occurrence: RecurringOccurrenceData
      rule: RecurringExpenseData
      status: 'paid' | 'unpaid'
    }) =>
      setRecurringExpenseStatus(
        session.csrfToken,
        rule.id,
        occurrence.recurrencePeriod,
        status === 'paid'
          ? { paidAmount: amount!, paidDate: date!, status }
          : { status },
      ),
    onSuccess: async (_, { status }) => {
      setPendingPayment(null)
      setNotice(
        status === 'paid' ? 'บันทึกการชำระแล้ว' : 'เปลี่ยนเป็นยังไม่จ่ายแล้ว',
      )
      await queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
    },
  })
  const stopMutation = useMutation({
    mutationFn: ({
      action,
      ruleId,
    }: {
      action: 'cancel' | 'retain'
      ruleId: string
    }) => stopRecurringExpense(session.csrfToken, ruleId, action),
    onSuccess: async (_, { action }) => {
      setStopping(null)
      setNotice(
        action === 'cancel'
          ? 'หยุดกฎและยกเลิกรายการอนาคตที่ยังไม่จ่ายแล้ว'
          : 'หยุดกฎแล้ว และคงรายการที่สร้างไว้',
      )
      await queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
    },
  })

  const expenseCategories =
    categoriesQuery.data?.filter(
      ({ direction, isActive }) => direction === 'expense' && isActive,
    ) ?? []
  const activeCards = cardsQuery.data?.filter(({ isActive }) => isActive) ?? []
  const rules = rulesQuery.data ?? []
  const actionError =
    saveMutation.error ?? paymentMutation.error ?? stopMutation.error

  function openCreate() {
    setEditing(null)
    form.reset(emptyForm())
    saveMutation.reset()
    setIsFormOpen(true)
  }

  function openEdit(rule: RecurringExpenseData) {
    setEditing(rule)
    form.reset({
      amount: minorToDecimal(rule.amountMinor),
      categoryId: rule.categoryId,
      creditCardId: rule.creditCardId ?? '',
      description: rule.description,
      paymentMethod: rule.paymentMethod,
      recurrenceDay: rule.recurrenceDay,
      startDate: rule.startDate,
    })
    saveMutation.reset()
    setIsFormOpen(true)
  }

  return (
    <main className="page-shell">
      <header className="page-header page-header-actions">
        <div>
          <p className="eyebrow">ค่าใช้จ่ายที่เกิดซ้ำแบบไม่กำหนดสิ้นสุด</p>
          <h1>รายการประจำ</h1>
          <p>แยกจากรายการครั้งเดียวและแผนผ่อนอย่างชัดเจน</p>
        </div>
        <button
          className="primary-button action-button"
          onClick={openCreate}
          type="button"
        >
          <Icon name="plus-lg" /> เพิ่มรายการประจำ
        </button>
      </header>

      <ActionNotice message={notice} setMessage={setNotice} />
      {rulesQuery.isPending ? (
        <p className="muted-state" aria-busy="true" role="status">
          กำลังโหลดรายการประจำ…
        </p>
      ) : rulesQuery.isError ? (
        <QueryError
          message="ไม่สามารถโหลดรายการประจำได้"
          onRetry={() => {
            void rulesQuery.refetch()
          }}
        />
      ) : rules.length === 0 ? (
        <section className="surface empty-list">
          <h2>ยังไม่มีรายการประจำ</h2>
          <p>เพิ่มค่าใช้จ่ายที่ต้องจ่ายทุกเดือน เช่น ค่าสมาชิกหรือค่าบริการ</p>
        </section>
      ) : (
        <section className="installment-plans" aria-label="รายการประจำทั้งหมด">
          {rules.map((rule) => (
            <RecurringCard
              isPending={paymentMutation.isPending || stopMutation.isPending}
              key={rule.id}
              onEdit={() => openEdit(rule)}
              onPay={(occurrence) => setPendingPayment({ occurrence, rule })}
              onStop={() => setStopping(rule)}
              onUnpay={(occurrence) =>
                paymentMutation.mutate({ occurrence, rule, status: 'unpaid' })
              }
              rule={rule}
            />
          ))}
        </section>
      )}

      {isFormOpen ? (
        <Modal
          labelledBy="recurring-form-title"
          onClose={() => {
            if (!saveMutation.isPending) setIsFormOpen(false)
          }}
        >
          <form
            aria-labelledby="recurring-form-title"
            className="form-dialog transaction-form"
            onSubmit={(event) =>
              void form.handleSubmit((values) => saveMutation.mutate(values))(
                event,
              )
            }
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">
                  {editing ? 'แก้ไขเฉพาะอนาคต' : 'กฎรายเดือนใหม่'}
                </p>
                <h2 id="recurring-form-title">
                  {editing ? 'แก้ไขรายการประจำ' : 'เพิ่มรายการประจำ'}
                </h2>
              </div>
              <button
                aria-label="ปิด"
                className="icon-button"
                onClick={() => setIsFormOpen(false)}
                type="button"
              >
                <Icon name="x-lg" />
              </button>
            </div>
            {editing ? (
              <div className="recurring-impact-note">
                <strong>
                  มีผลกับรายการที่ยังไม่จ่ายตั้งแต่เดือนนี้เป็นต้นไป
                </strong>
                <p>รายการที่จ่ายแล้วและประวัติเดิมจะคงข้อมูลเดิม</p>
              </div>
            ) : null}
            <label className="field">
              ชื่อรายการ
              <input
                aria-invalid={Boolean(form.formState.errors.description)}
                aria-describedby={
                  form.formState.errors.description
                    ? 'RecurringExpensesPage-description-error'
                    : undefined
                }
                {...form.register('description')}
              />
              <FieldError
                id="RecurringExpensesPage-description-error"
                message={form.formState.errors.description?.message}
              />
            </label>
            <label className="field">
              จำนวนเงิน (บาท)
              <input
                aria-invalid={Boolean(form.formState.errors.amount)}
                aria-describedby={
                  form.formState.errors.amount
                    ? 'RecurringExpensesPage-amount-error'
                    : undefined
                }
                inputMode="decimal"
                {...form.register('amount')}
              />
              <FieldError
                id="RecurringExpensesPage-amount-error"
                message={form.formState.errors.amount?.message}
              />
            </label>
            <label className="field">
              วันเริ่มต้น
              <input
                aria-invalid={Boolean(form.formState.errors.startDate)}
                aria-describedby={
                  form.formState.errors.startDate
                    ? 'RecurringExpensesPage-startDate-error'
                    : undefined
                }
                type="date"
                {...form.register('startDate')}
              />
              <FieldError
                id="RecurringExpensesPage-startDate-error"
                message={form.formState.errors.startDate?.message}
              />
            </label>
            <label className="field">
              วันที่เกิดรายการทุกเดือน
              <input
                aria-invalid={Boolean(form.formState.errors.recurrenceDay)}
                aria-describedby={
                  form.formState.errors.recurrenceDay
                    ? 'RecurringExpensesPage-recurrenceDay-error'
                    : undefined
                }
                inputMode="numeric"
                min={1}
                max={31}
                type="number"
                {...form.register('recurrenceDay', { valueAsNumber: true })}
              />
              <FieldError
                id="RecurringExpensesPage-recurrenceDay-error"
                message={form.formState.errors.recurrenceDay?.message}
              />
            </label>
            <label className="field">
              หมวดรายจ่าย
              <select
                aria-invalid={Boolean(form.formState.errors.categoryId)}
                aria-describedby={
                  form.formState.errors.categoryId
                    ? 'RecurringExpensesPage-categoryId-error'
                    : undefined
                }
                {...form.register('categoryId')}
              >
                <option value="">เลือกหมวดหมู่</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <FieldError
                id="RecurringExpensesPage-categoryId-error"
                message={form.formState.errors.categoryId?.message}
              />
            </label>
            <label className="field">
              วิธีชำระ
              <select {...form.register('paymentMethod')}>
                {Object.entries(paymentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
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
                      ? 'RecurringExpensesPage-creditCardId-error'
                      : undefined
                  }
                  {...form.register('creditCardId')}
                >
                  <option value="">เลือกบัตร</option>
                  {activeCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.maskedSuffix
                        ? `${card.name} •••• ${card.maskedSuffix}`
                        : card.name}
                    </option>
                  ))}
                </select>
                <FieldError
                  id="RecurringExpensesPage-creditCardId-error"
                  message={form.formState.errors.creditCardId?.message}
                />
              </label>
            ) : null}
            {saveMutation.error ? (
              <p className="form-error" role="alert">
                {saveMutation.error.message}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setIsFormOpen(false)}
                type="button"
              >
                ยกเลิก
              </button>
              <button
                className="primary-button"
                disabled={saveMutation.isPending}
                type="submit"
              >
                {saveMutation.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {pendingPayment ? (
        <PaymentDialog
          error={paymentMutation.error?.message}
          isPending={paymentMutation.isPending}
          occurrence={pendingPayment.occurrence}
          onClose={() => setPendingPayment(null)}
          onConfirm={(amount, date) =>
            paymentMutation.mutate({
              amount,
              date,
              ...pendingPayment,
              status: 'paid',
            })
          }
        />
      ) : null}

      {stopping ? (
        <StopDialog
          error={stopMutation.error?.message}
          isPending={stopMutation.isPending}
          onClose={() => setStopping(null)}
          onConfirm={(action) =>
            stopMutation.mutate({ action, ruleId: stopping.id })
          }
        />
      ) : null}

      {actionError && !isFormOpen && !pendingPayment && !stopping ? (
        <p className="inline-error" role="alert">
          {actionError.message}
        </p>
      ) : null}
    </main>
  )
}

function RecurringCard({
  isPending,
  onEdit,
  onPay,
  onStop,
  onUnpay,
  rule,
}: {
  isPending: boolean
  onEdit: () => void
  onPay: (occurrence: RecurringOccurrenceData) => void
  onStop: () => void
  onUnpay: (occurrence: RecurringOccurrenceData) => void
  rule: RecurringExpenseData
}) {
  const current = rule.occurrences.find(({ status }) => status === 'unpaid')
  return (
    <article className="surface installment-plan-card recurring-rule-card">
      <div className="installment-plan-heading">
        <div>
          <p className="eyebrow">กฎรายเดือน · {rule.categoryName}</p>
          <h2>{rule.description}</h2>
          <p>
            {formatThbMinor(rule.amountMinor)} ทุกวันที่ {rule.recurrenceDay} ·{' '}
            {paymentLabels[rule.paymentMethod]}
          </p>
        </div>
        <span className={`status-label ${rule.status}`}>
          {rule.status === 'active' ? 'ทำงานอยู่' : 'หยุดแล้ว'}
        </span>
      </div>
      {rule.status === 'active' && current ? (
        <div className="current-installment-action">
          <div>
            <span>รายการเดือนปัจจุบัน</span>
            <strong>{formatThbMinor(current.amountMinor)}</strong>
            <small>ครบกำหนด {formatThaiDate(current.dueDate)}</small>
            <span className="status-label unpaid">ยังไม่จ่าย</span>
          </div>
          <button
            aria-label={`บันทึกว่าจ่ายแล้ว ${rule.description} ครบกำหนด ${formatThaiDate(current.dueDate)}`}
            className="primary-button"
            disabled={isPending}
            onClick={() => onPay(current)}
            type="button"
          >
            บันทึกว่าจ่ายแล้ว
          </button>
        </div>
      ) : null}
      <details className="installment-details">
        <summary>
          รายการรายเดือนที่สร้างแล้ว {rule.occurrences.length} รายการ
        </summary>
        <ol className="installment-occurrences">
          {rule.occurrences.map((occurrence) => (
            <li key={occurrence.id}>
              <div>
                <strong>ครบกำหนด {formatThaiDate(occurrence.dueDate)}</strong>
                <span>
                  {formatThbMinor(occurrence.amountMinor)} ·{' '}
                  {occurrence.categoryName}
                </span>
                <div className="installment-occurrence-status">
                  <span className={`status-label ${occurrence.status}`}>
                    {recurringOccurrenceStatusLabel(occurrence.status)}
                  </span>
                  {occurrence.status === 'paid' ? (
                    <small>
                      จ่าย {formatThbMinor(occurrence.paidAmountMinor!)} เมื่อ{' '}
                      {formatThaiDate(occurrence.paidDate!)}
                    </small>
                  ) : null}
                </div>
              </div>
              {occurrence.status === 'unpaid' ? (
                <button
                  aria-label={`จ่ายแล้ว ${rule.description} ครบกำหนด ${formatThaiDate(occurrence.dueDate)}`}
                  className="small-button"
                  disabled={isPending}
                  onClick={() => onPay(occurrence)}
                  type="button"
                >
                  จ่ายแล้ว
                </button>
              ) : occurrence.status === 'paid' ? (
                <button
                  aria-label={`เปลี่ยนเป็นยังไม่จ่าย ${rule.description} ครบกำหนด ${formatThaiDate(occurrence.dueDate)}`}
                  className="small-button"
                  disabled={isPending}
                  onClick={() => onUnpay(occurrence)}
                  type="button"
                >
                  เปลี่ยนเป็นยังไม่จ่าย
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </details>
      {rule.status === 'active' ? (
        <div className="row-actions">
          <button className="text-button" onClick={onEdit} type="button">
            แก้ไขอนาคต
          </button>
          <button className="text-button danger" onClick={onStop} type="button">
            หยุดรายการประจำ
          </button>
        </div>
      ) : null}
    </article>
  )
}

function PaymentDialog({
  error,
  isPending,
  occurrence,
  onClose,
  onConfirm,
}: {
  error: string | undefined
  isPending: boolean
  occurrence: RecurringOccurrenceData
  onClose: () => void
  onConfirm: (amount: string, date: string) => void
}) {
  return (
    <Modal
      labelledBy="recurring-payment-title"
      onClose={() => {
        if (!isPending) onClose()
      }}
      payment
    >
      <form
        aria-labelledby="recurring-payment-title"
        className="form-dialog payment-dialog-sheet"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const amount = data.get('amount')
          const date = data.get('date')
          if (typeof amount === 'string' && typeof date === 'string') {
            onConfirm(amount, date)
          }
        }}
      >
        <div className="payment-dialog-heading">
          <div>
            <p className="eyebrow">ยืนยันการชำระ</p>
            <h2 id="recurring-payment-title">รายการประจำ</h2>
          </div>
          <strong>{formatThbMinor(occurrence.amountMinor)}</strong>
        </div>
        <p className="payment-dialog-description">
          {occurrence.description} · ครบกำหนด{' '}
          {formatThaiDate(occurrence.dueDate)}
        </p>
        <label className="field">
          ยอดที่จ่าย (บาท)
          <input
            defaultValue={minorToDecimal(occurrence.amountMinor)}
            inputMode="decimal"
            name="amount"
            pattern="\d+(?:\.\d{1,2})?"
            required
          />
        </label>
        <label className="field">
          วันที่ชำระ
          <input
            defaultValue={todayInBangkok()}
            name="date"
            required
            type="date"
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="payment-dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            ยกเลิก
          </button>
          <button className="primary-button" disabled={isPending} type="submit">
            ยืนยันว่าจ่ายแล้ว
          </button>
        </div>
      </form>
    </Modal>
  )
}

function StopDialog({
  error,
  isPending,
  onClose,
  onConfirm,
}: {
  error: string | undefined
  isPending: boolean
  onClose: () => void
  onConfirm: (action: 'cancel' | 'retain') => void
}) {
  return (
    <Modal
      labelledBy="stop-recurring-title"
      onClose={() => {
        if (!isPending) onClose()
      }}
    >
      <form
        aria-labelledby="stop-recurring-title"
        className="form-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          const action = new FormData(event.currentTarget).get('action')
          if (action === 'cancel' || action === 'retain') onConfirm(action)
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">หยุดการสร้างรายการใหม่</p>
            <h2 id="stop-recurring-title">จัดการรายการอนาคต</h2>
          </div>
        </div>
        <label className="remember-row">
          <input defaultChecked name="action" type="radio" value="cancel" />
          ยกเลิกรายการอนาคตที่ยังไม่จ่าย
        </label>
        <label className="remember-row">
          <input name="action" type="radio" value="retain" />
          คงรายการที่สร้างไว้ให้จ่ายต่อ
        </label>
        <p className="muted-copy">
          รายการที่จ่ายแล้วและประวัติเดิมจะไม่ถูกแก้ไข
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            กลับ
          </button>
          <button className="primary-button" disabled={isPending} type="submit">
            ยืนยันหยุดรายการ
          </button>
        </div>
      </form>
    </Modal>
  )
}

function emptyForm(): FormValues {
  const today = todayInBangkok()
  return {
    amount: '',
    categoryId: '',
    creditCardId: '',
    description: '',
    paymentMethod: 'bank_transfer',
    recurrenceDay: Number(today.slice(8, 10)),
    startDate: today,
  }
}

function minorToDecimal(value: string) {
  const minor = BigInt(value)
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

function recurringOccurrenceStatusLabel(
  status: RecurringOccurrenceData['status'],
) {
  return status === 'paid'
    ? 'จ่ายแล้ว'
    : status === 'cancelled'
      ? 'ยกเลิกแล้ว'
      : 'ยังไม่จ่าย'
}

function FieldError({
  id,
  message,
}: {
  id: string
  message: string | undefined
}) {
  return message ? (
    <small id={id} role="alert">
      {message}
    </small>
  ) : null
}
