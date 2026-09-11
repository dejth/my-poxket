import { QueryError } from '../app/QueryError'
import { zodResolver } from '@hookform/resolvers/zod'
import { calculateInstallmentEndDate } from '@my-poxket/domain/calendar'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { Modal } from '../app/Modal'
import { ActionNotice } from '../app/ActionNotice'
import {
  cancelInstallmentPlan,
  createInstallmentPlan,
  getCategories,
  getCreditCards,
  getInstallmentPlans,
  setInstallmentStatus,
  type InstallmentOccurrenceData,
  type InstallmentPlanData,
  type PaymentMethod,
} from '../app/api'
import { useAuthenticatedContext } from '../app/authenticated-context'
import {
  formatThaiDate,
  formatThbMinor,
  todayInBangkok,
} from './finance-format'

const formSchema = z
  .object({
    categoryId: z.string().min(1, 'กรุณาเลือกหมวดรายจ่าย'),
    creditCardId: z.string(),
    description: z.string().trim().min(1, 'กรุณาระบุชื่อแผน').max(255),
    firstPaymentDate: z.string().min(1, 'กรุณาระบุวันที่งวดแรก'),
    installmentAmount: z
      .string()
      .regex(/^\d+(?:\.\d{1,2})?$/, 'ระบุจำนวนเงินไม่เกิน 2 ตำแหน่ง'),
    paymentMethod: z.enum([
      'cash',
      'bank_transfer',
      'debit_card',
      'other',
      'credit_card',
    ]),
    totalAmount: z.union([
      z.literal(''),
      z.string().regex(/^\d+(?:\.\d{1,2})?$/, 'ระบุจำนวนเงินไม่เกิน 2 ตำแหน่ง'),
    ]),
    totalInstallments: z.number().int().min(1).max(65_535),
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

const planStatusLabels = {
  active: 'กำลังผ่อน',
  cancelled: 'ยกเลิกแล้ว',
  completed: 'ครบแล้ว',
  settled: 'ปิดยอดแล้ว',
} as const

const PLANS_PER_PAGE = 10

export function InstallmentsPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const idempotencyKey = useRef(crypto.randomUUID())
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [planPage, setPlanPage] = useState(1)
  const [planView, setPlanView] = useState<'active' | 'history'>('active')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [pendingPayment, setPendingPayment] = useState<{
    readonly occurrence: InstallmentOccurrenceData
    readonly plan: InstallmentPlanData
  } | null>(null)
  const categoriesQuery = useQuery({
    queryFn: getCategories,
    queryKey: ['categories'],
  })
  const cardsQuery = useQuery({
    queryFn: getCreditCards,
    queryKey: ['credit-cards'],
  })
  const plansQuery = useQuery({
    queryFn: getInstallmentPlans,
    queryKey: ['installment-plans'],
  })
  const form = useForm<FormValues>({
    defaultValues: {
      categoryId: '',
      creditCardId: '',
      description: '',
      firstPaymentDate: todayInBangkok(),
      installmentAmount: '',
      paymentMethod: 'bank_transfer',
      totalAmount: '',
      totalInstallments: 1,
    },
    resolver: zodResolver(formSchema),
  })
  const firstPaymentDate = useWatch({
    control: form.control,
    name: 'firstPaymentDate',
  })
  const paymentMethod = useWatch({
    control: form.control,
    name: 'paymentMethod',
  })
  const totalInstallments = useWatch({
    control: form.control,
    name: 'totalInstallments',
  })
  const endDate = getEndDatePreview(firstPaymentDate, totalInstallments)

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createInstallmentPlan(session.csrfToken, {
        categoryId: values.categoryId,
        ...(values.paymentMethod === 'credit_card' && values.creditCardId
          ? { creditCardId: values.creditCardId }
          : {}),
        description: values.description,
        firstPaymentDate: values.firstPaymentDate,
        idempotencyKey: idempotencyKey.current,
        installmentAmount: values.installmentAmount,
        paymentMethod: values.paymentMethod,
        ...(values.totalAmount ? { totalAmount: values.totalAmount } : {}),
        totalInstallments: values.totalInstallments,
      }),
    onSuccess: async () => {
      idempotencyKey.current = crypto.randomUUID()
      setNotice('สร้างแผนผ่อนแล้ว')
      form.reset({
        categoryId: '',
        creditCardId: '',
        description: '',
        firstPaymentDate: todayInBangkok(),
        installmentAmount: '',
        paymentMethod: 'bank_transfer',
        totalAmount: '',
        totalInstallments: 1,
      })
      setIsCreateOpen(false)
      setPlanPage(1)
      setPlanView('active')
      await queryClient.invalidateQueries({ queryKey: ['installment-plans'] })
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({
      installmentNumber,
      closesPlan,
      paidAmount,
      paidDate,
      planId,
      status,
    }: {
      installmentNumber: number
      closesPlan?: boolean
      paidAmount?: string
      paidDate?: string
      planId: string
      status: 'paid' | 'unpaid'
    }) =>
      setInstallmentStatus(
        session.csrfToken,
        planId,
        installmentNumber,
        status === 'paid'
          ? {
              closesPlan: closesPlan ?? false,
              paidAmount: paidAmount!,
              paidDate: paidDate!,
              status,
            }
          : { status: 'unpaid' },
      ),
    onSuccess: async (_, { closesPlan, status }) => {
      if (status === 'paid') setPendingPayment(null)
      setPlanPage(1)
      if (closesPlan) setPlanView('history')
      setNotice(
        closesPlan
          ? 'บันทึกการปิดยอดแล้ว งวดที่เหลือถูกยกเลิก'
          : status === 'paid'
            ? 'บันทึกการชำระแล้ว'
            : 'เปลี่ยนเป็นยังไม่จ่ายแล้ว',
      )
      await queryClient.invalidateQueries({ queryKey: ['installment-plans'] })
    },
  })
  const cancelMutation = useMutation({
    mutationFn: (planId: string) =>
      cancelInstallmentPlan(session.csrfToken, planId),
    onSuccess: async () => {
      setPlanPage(1)
      setNotice('ยกเลิกงวดที่ยังไม่จ่ายแล้ว ประวัติที่จ่ายแล้วยังคงอยู่')
      await queryClient.invalidateQueries({ queryKey: ['installment-plans'] })
    },
  })

  const expenseCategories =
    categoriesQuery.data?.filter(
      ({ direction, isActive }) => direction === 'expense' && isActive,
    ) ?? []
  const activeCards = cardsQuery.data?.filter(({ isActive }) => isActive) ?? []
  const actionError = statusMutation.error ?? cancelMutation.error
  const plans = plansQuery.data ?? []
  const activePlanCount = plans.filter(
    ({ status }) => status === 'active',
  ).length
  const filteredPlans = plans.filter(({ status }) =>
    planView === 'active' ? status === 'active' : status !== 'active',
  )
  const sortedPlans = filteredPlans.toSorted((left, right) => {
    const dateComparison =
      sortDirection === 'desc'
        ? right.firstPaymentDate.localeCompare(left.firstPaymentDate)
        : left.firstPaymentDate.localeCompare(right.firstPaymentDate)
    return dateComparison || right.createdAt.localeCompare(left.createdAt)
  })
  const totalPlanPages = Math.max(
    1,
    Math.ceil(filteredPlans.length / PLANS_PER_PAGE),
  )
  const visiblePlans = sortedPlans.slice(
    (planPage - 1) * PLANS_PER_PAGE,
    planPage * PLANS_PER_PAGE,
  )

  return (
    <main className="page-shell">
      <header className="page-header page-header-actions">
        <div>
          <p className="eyebrow">ภาระผ่อนแบบมีกำหนดสิ้นสุด</p>
          <h1>ผ่อนชำระและเงินกู้</h1>
          <p>จัดการงวดที่ต้องจ่าย และติดตามความคืบหน้าแบบ N/N</p>
        </div>
        <button
          className="primary-button action-button"
          onClick={() => {
            createMutation.reset()
            setIsCreateOpen(true)
          }}
          type="button"
        >
          + สร้างแผนผ่อน
        </button>
      </header>

      <ActionNotice message={notice} setMessage={setNotice} />

      <section className="installment-layout">
        {isCreateOpen ? (
          <Modal
            labelledBy="installment-form-title"
            onClose={() => {
              if (!createMutation.isPending) setIsCreateOpen(false)
            }}
          >
            <form
              aria-labelledby="installment-form-title"
              className="form-dialog installment-plan-form"
              onSubmit={(event) => {
                void form.handleSubmit((values) =>
                  createMutation.mutate(values),
                )(event)
              }}
            >
              <div className="dialog-heading">
                <div>
                  <p className="eyebrow">แผนใหม่</p>
                  <h2 id="installment-form-title">สร้างแผนผ่อน</h2>
                </div>
                <button
                  aria-label="ปิด"
                  className="icon-button"
                  disabled={createMutation.isPending}
                  onClick={() => setIsCreateOpen(false)}

                  type="button"
                >
                  ×
                </button>
              </div>

              <label className="field">
                ชื่อแผน
                <input
                  aria-invalid={Boolean(form.formState.errors.description)}
                  aria-describedby={
                    form.formState.errors.description
                      ? 'InstallmentsPage-description-error'
                      : undefined
                  }
                  placeholder="เช่น โน้ตบุ๊กตัวอย่าง"
                  {...form.register('description')}
                />
                <FieldError
                  id="InstallmentsPage-description-error"
                  message={form.formState.errors.description?.message}
                />
              </label>

              <div className="field">
                <label htmlFor="installment-total-amount">
                  ยอดรวม (บาท, ไม่บังคับ)
                </label>
                <input
                  aria-invalid={Boolean(form.formState.errors.totalAmount)}
                  aria-describedby={
                    form.formState.errors.totalAmount
                      ? 'installment-total-amount-hint installment-total-amount-error'
                      : 'installment-total-amount-hint'
                  }
                  autoComplete="off"
                  id="installment-total-amount"
                  inputMode="decimal"
                  placeholder="เช่น 60000.00"
                  {...form.register('totalAmount')}
                />
                <FieldError
                  id="installment-total-amount-error"
                  message={form.formState.errors.totalAmount?.message}
                />
                <small
                  className="field-hint"
                  id="installment-total-amount-hint"
                >
                  สินเชื่อที่ยังไม่ทราบดอกเบี้ยรวมสามารถเว้นว่างได้
                </small>
              </div>

              <label className="field">
                ยอดจ่ายต่องวด (บาท)
                <input
                  aria-invalid={Boolean(
                    form.formState.errors.installmentAmount,
                  )}
                  aria-describedby={
                    form.formState.errors.installmentAmount
                      ? 'InstallmentsPage-installmentAmount-error'
                      : undefined
                  }
                  autoComplete="off"
                  inputMode="decimal"
                  placeholder="เช่น 1250.75"
                  {...form.register('installmentAmount')}
                />
                <FieldError
                  id="InstallmentsPage-installmentAmount-error"
                  message={form.formState.errors.installmentAmount?.message}
                />
              </label>

              <div className="card-rule-grid">
                <label className="field">
                  จำนวนงวด
                  <input
                    aria-invalid={Boolean(
                      form.formState.errors.totalInstallments,
                    )}
                    aria-describedby={
                      form.formState.errors.totalInstallments
                        ? 'InstallmentsPage-totalInstallments-error'
                        : undefined
                    }
                    inputMode="numeric"
                    min={1}
                    type="number"
                    {...form.register('totalInstallments', {
                      valueAsNumber: true,
                    })}
                  />
                  <FieldError
                    id="InstallmentsPage-totalInstallments-error"
                    message={form.formState.errors.totalInstallments?.message}
                  />
                </label>
                <label className="field">
                  วันที่งวดแรก
                  <input
                    aria-invalid={Boolean(
                      form.formState.errors.firstPaymentDate,
                    )}
                    aria-describedby={
                      form.formState.errors.firstPaymentDate
                        ? 'InstallmentsPage-firstPaymentDate-error'
                        : undefined
                    }
                    type="date"
                    {...form.register('firstPaymentDate')}
                  />
                  <FieldError
                    id="InstallmentsPage-firstPaymentDate-error"
                    message={form.formState.errors.firstPaymentDate?.message}
                  />
                </label>
              </div>

              <p className="form-hint">
                {endDate
                  ? `งวดสุดท้าย ${formatThaiDate(endDate)}`
                  : 'ระบุวันที่และจำนวนงวดเพื่อดูวันสิ้นสุด'}
              </p>
              <p className="form-hint">
                แผนนี้ติดตามภาระชำระ และไม่สร้างรายการรายจ่ายอัตโนมัติ
              </p>

              <label className="field">
                หมวดรายจ่าย
                <select
                  aria-invalid={Boolean(form.formState.errors.categoryId)}
                  aria-describedby={
                    form.formState.errors.categoryId
                      ? 'InstallmentsPage-categoryId-error'
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
                  id="InstallmentsPage-categoryId-error"
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
                        ? 'InstallmentsPage-creditCardId-error'
                        : undefined
                    }
                    {...form.register('creditCardId')}
                  >
                    <option value="">เลือกบัตรเครดิต</option>
                    {activeCards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {formatCardName(card)}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="InstallmentsPage-creditCardId-error"
                    message={form.formState.errors.creditCardId?.message}
                  />
                </label>
              ) : null}

              {createMutation.error ? (
                <p className="form-error" role="alert">
                  {createMutation.error.message}
                </p>
              ) : null}

              <button
                className="primary-button"
                disabled={createMutation.isPending}
                type="submit"
              >
                {createMutation.isPending ? 'กำลังสร้าง…' : 'สร้างแผนผ่อน'}
              </button>
            </form>
          </Modal>
        ) : null}

        <section className="installment-plans" aria-label="แผนผ่อนทั้งหมด">
          {plans.length > 0 ? (
            <div className="installment-list-controls">
              <div
                className="installment-view-tabs"
                aria-label="ประเภทแผนผ่อน"
                role="group"
              >
                <button
                  aria-pressed={planView === 'active'}
                  onClick={() => {
                    setPlanPage(1)
                    setPlanView('active')
                  }}
                  type="button"
                >
                  กำลังผ่อน {activePlanCount}
                </button>
                <button
                  aria-pressed={planView === 'history'}
                  onClick={() => {
                    setPlanPage(1)
                    setPlanView('history')
                  }}
                  type="button"
                >
                  ประวัติ {plans.length - activePlanCount}
                </button>
              </div>
              <button
                className="small-button installment-sort-button"
                onClick={() => {
                  setPlanPage(1)
                  setSortDirection((direction) =>
                    direction === 'desc' ? 'asc' : 'desc',
                  )
                }}
                type="button"
              >
                วันที่งวดแรก:{' '}
                {sortDirection === 'desc' ? 'ใหม่ก่อน' : 'เก่าก่อน'}
              </button>
            </div>
          ) : null}
          {actionError ? (
            <div className="surface inline-error" role="alert">
              {actionError.message}
            </div>
          ) : null}
          {plansQuery.isPending ? (
            <div className="surface muted-state" aria-busy="true" role="status">
              กำลังโหลดแผนผ่อน…
            </div>
          ) : plansQuery.isError ? (
            <QueryError
              message={plansQuery.error.message}
              onRetry={() => {
                void plansQuery.refetch()
              }}
            />
          ) : plans.length === 0 ? (
            <div className="surface empty-list">
              <h2>ยังไม่มีแผนผ่อน</h2>
              <p>สร้างแผนแรกเพื่อดูงวดและสถานะการจ่าย</p>
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="surface empty-list">
              <h2>
                {planView === 'active'
                  ? 'ไม่มีแผนที่กำลังผ่อน'
                  : 'ยังไม่มีประวัติ'}
              </h2>
              <p>
                {planView === 'active'
                  ? 'แผนที่ครบหรือยกเลิกแล้วอยู่ในประวัติ'
                  : 'แผนที่ครบหรือยกเลิกแล้วจะแสดงที่นี่'}
              </p>
            </div>
          ) : (
            visiblePlans.map((plan) => (
              <InstallmentPlanCard
                isPending={statusMutation.isPending || cancelMutation.isPending}
                key={plan.id}
                onCancel={() => {
                  if (
                    window.confirm(
                      'ยกเลิกงวดที่ยังไม่จ่ายใช่หรือไม่ ประวัติที่จ่ายแล้วจะยังคงอยู่',
                    )
                  ) {
                    cancelMutation.mutate(plan.id)
                  }
                }}
                onPay={(occurrence) => setPendingPayment({ occurrence, plan })}
                onUnpay={(occurrence) =>
                  statusMutation.mutate({
                    installmentNumber: occurrence.installmentNumber,
                    planId: plan.id,
                    status: 'unpaid',
                  })
                }
                plan={plan}
              />
            ))
          )}
          {filteredPlans.length > PLANS_PER_PAGE ? (
            <nav className="surface pagination-row" aria-label="หน้าแผนผ่อน">
              <button
                className="small-button"
                disabled={planPage === 1}
                onClick={() => setPlanPage((page) => page - 1)}
                type="button"
              >
                ก่อนหน้า
              </button>
              <span>
                หน้า {planPage}/{totalPlanPages} · {filteredPlans.length} แผน
              </span>
              <button
                className="small-button"
                disabled={planPage === totalPlanPages}
                onClick={() => setPlanPage((page) => page + 1)}
                type="button"
              >
                ถัดไป
              </button>
            </nav>
          ) : null}
        </section>
      </section>

      {pendingPayment ? (
        <PaymentDialog
          error={statusMutation.error?.message}
          isPending={statusMutation.isPending}
          occurrence={pendingPayment.occurrence}
          onClose={() => setPendingPayment(null)}
          onConfirm={(paidAmount, paidDate, closesPlan) =>
            statusMutation.mutate({
              installmentNumber: pendingPayment.occurrence.installmentNumber,
              closesPlan,
              paidAmount,
              paidDate,
              planId: pendingPayment.plan.id,
              status: 'paid',
            })
          }
          plan={pendingPayment.plan}
        />
      ) : null}
    </main>
  )
}

function InstallmentPlanCard({
  isPending,
  onCancel,
  onPay,
  onUnpay,
  plan,
}: {
  readonly isPending: boolean
  readonly onCancel: () => void
  readonly onPay: (occurrence: InstallmentOccurrenceData) => void
  readonly onUnpay: (occurrence: InstallmentOccurrenceData) => void
  readonly plan: InstallmentPlanData
}) {
  const current =
    plan.occurrences.find(({ status }) => status === 'unpaid') ??
    plan.occurrences.find(({ closesPlan }) => closesPlan) ??
    plan.occurrences.at(-1)
  const paidCount = plan.occurrences.filter(
    ({ status }) => status === 'paid',
  ).length
  const settlement = plan.occurrences.find(({ closesPlan }) => closesPlan)
  const paidAmountMinor = plan.occurrences.reduce(
    (sum, occurrence) => sum + BigInt(occurrence.paidAmountMinor ?? '0'),
    0n,
  )

  return (
    <article className="surface installment-plan-card">
      <div className="installment-plan-heading">
        <div>
          <p className="eyebrow">{plan.categoryName}</p>
          <h2>{plan.description}</h2>
          <p>
            {formatOptionalAmount(plan.totalAmountMinor, 'ยอดรวมไม่ระบุ')} ·{' '}
            {paymentLabels[plan.paymentMethod]}
          </p>
        </div>
        <span className={`status-label ${plan.status}`}>
          {planStatusLabels[plan.status]}
        </span>
      </div>

      <div className="installment-summary">
        <div>
          <span>ชำระแล้ว</span>
          <strong>
            {paidCount} จาก {plan.totalInstallments} งวด
          </strong>
        </div>
        <div>
          <span>งวดปัจจุบัน</span>
          <strong>
            {current ? currentInstallmentLabel(current, plan) : '—'}
          </strong>
        </div>
        <div>
          <span>ยอดจ่ายจริง</span>
          <strong>{formatThbMinor(paidAmountMinor.toString())}</strong>
        </div>
        <div>
          <span>{settlement ? 'ปิดยอดเมื่อ' : 'สิ้นสุด'}</span>
          <strong>
            {formatThaiDate(settlement?.paidDate ?? plan.endDate)}
          </strong>
        </div>
      </div>

      {plan.status === 'active' && current?.status === 'unpaid' ? (
        <div className="current-installment-action">
          <div>
            <span>งวดที่ต้องจัดการ</span>
            <strong>
              งวด {current.installmentNumber}/{plan.totalInstallments}
            </strong>
            <span>
              ยอดตามแผน{' '}
              {formatOptionalAmount(current.amountMinor, 'ระบุยอดตอนจ่าย')}
            </span>
            <small>ครบกำหนด {formatThaiDate(current.dueDate)}</small>
          </div>
          <button
            aria-label={`บันทึกว่าจ่ายแล้ว งวด ${current.installmentNumber}/${plan.totalInstallments} ของ ${plan.description}`}
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
        <summary>ดูรายละเอียด {plan.totalInstallments} งวด</summary>
        <ol className="installment-occurrences">
          {plan.occurrences.map((occurrence) => (
            <li key={occurrence.id}>
              <div>
                <strong>
                  งวด {occurrence.installmentNumber}/{plan.totalInstallments}
                </strong>
                <span>ครบกำหนด {formatThaiDate(occurrence.dueDate)}</span>
                <span>
                  ยอดตามแผน{' '}
                  {formatOptionalAmount(
                    occurrence.amountMinor,
                    'ยังไม่ระบุยอด',
                  )}
                </span>
                <div className="installment-occurrence-status">
                  <span className={`status-label ${occurrence.status}`}>
                    {occurrenceStatusLabel(occurrence, plan)}
                  </span>
                  {occurrence.status === 'paid' ? (
                    <small>
                      ยอดจ่ายจริง {formatThbMinor(occurrence.paidAmountMinor!)}{' '}
                      · {formatThaiDate(occurrence.paidDate!)}
                    </small>
                  ) : null}
                </div>
              </div>
              {plan.status === 'active' && occurrence.status === 'unpaid' ? (
                <button
                  aria-label={`จ่ายแล้ว งวด ${occurrence.installmentNumber}/${plan.totalInstallments} ของ ${plan.description}`}
                  className="small-button"
                  disabled={isPending}
                  onClick={() => onPay(occurrence)}
                  type="button"
                >
                  จ่ายแล้ว
                </button>
              ) : occurrence.status === 'paid' &&
                (plan.status !== 'settled' || occurrence.closesPlan) &&
                plan.status !== 'cancelled' ? (
                <button
                  aria-label={`${occurrence.closesPlan ? 'ยกเลิกการปิดยอด' : 'เปลี่ยนเป็นยังไม่จ่าย'} งวด ${occurrence.installmentNumber}/${plan.totalInstallments} ของ ${plan.description}`}
                  className="small-button"
                  disabled={isPending}
                  onClick={() => onUnpay(occurrence)}
                  type="button"
                >
                  {occurrence.closesPlan
                    ? 'ยกเลิกการปิดยอด'
                    : 'เปลี่ยนเป็นยังไม่จ่าย'}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </details>

      {plan.status === 'active' ? (
        <button
          aria-label={`ยกเลิกงวดที่ยังไม่จ่ายของ ${plan.description}`}
          className="text-button danger"
          disabled={isPending}
          onClick={onCancel}
          type="button"
        >
          ยกเลิกงวดที่ยังไม่จ่าย
        </button>
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
  plan,
}: {
  readonly error: string | undefined
  readonly isPending: boolean
  readonly occurrence: InstallmentOccurrenceData
  readonly onClose: () => void
  readonly onConfirm: (
    paidAmount: string,
    paidDate: string,
    closesPlan: boolean,
  ) => void
  readonly plan: InstallmentPlanData
}) {
  return (
    <Modal
      labelledBy="payment-dialog-title"
      onClose={() => {
        if (!isPending) onClose()
      }}
      payment
    >
      <form
        aria-labelledby="payment-dialog-title"
        className="form-dialog payment-dialog-sheet"
        onSubmit={(event) => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
          const paidAmount = formData.get('paidAmount')
          const paidDate = formData.get('paidDate')
          const closesPlan = formData.get('closesPlan') === 'on'
          if (
            typeof paidAmount === 'string' &&
            paidAmount &&
            typeof paidDate === 'string' &&
            paidDate
          ) {
            onConfirm(paidAmount, paidDate, closesPlan)
          }
        }}
      >
        <div className="payment-dialog-heading">
          <div>
            <p className="eyebrow">ยืนยันการชำระ</p>
            <h2 id="payment-dialog-title">
              งวด {occurrence.installmentNumber}/{plan.totalInstallments}
            </h2>
          </div>
          <strong>
            {formatOptionalAmount(occurrence.amountMinor, 'ยังไม่ระบุยอด')}
          </strong>
        </div>
        <p className="payment-dialog-description">
          {plan.description} · ครบกำหนด {formatThaiDate(occurrence.dueDate)}
        </p>
        <label className="field">
          ยอดที่จ่าย (บาท)
          <input
            autoComplete="off"
            defaultValue={minorToDecimalInput(occurrence.amountMinor)}
            inputMode="decimal"
            name="paidAmount"
            pattern="\d+(?:\.\d{1,2})?"
            placeholder="0.00"
            required
          />
        </label>
        <label className="field">
          วันที่ชำระ
          <input
            autoComplete="off"
            defaultValue={todayInBangkok()}
            name="paidDate"
            required
            type="date"
          />
        </label>
        <label className="remember-row settlement-option">
          <input name="closesPlan" type="checkbox" />
          ปิดยอดผ่อนทั้งหมด
        </label>
        <p className="settlement-hint">
          ใช้เมื่อยอดที่จ่ายครั้งนี้ปิดบัญชีแล้ว งวดที่เหลือจะถูกยกเลิก
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="payment-dialog-actions">
          <button
            className="secondary-button"
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            ยกเลิก
          </button>
          <button className="primary-button" disabled={isPending} type="submit">
            {isPending ? 'กำลังบันทึก…' : 'ยืนยันว่าจ่ายแล้ว'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function occurrenceStatusLabel(
  occurrence: InstallmentOccurrenceData,
  plan: InstallmentPlanData,
) {
  if (occurrence.status === 'paid')
    return occurrence.closesPlan ? 'ปิดยอดแล้ว' : 'จ่ายแล้ว'
  if (occurrence.status === 'cancelled')
    return plan.status === 'settled' ? 'ยกเลิกจากการปิดยอด' : 'ยกเลิกแล้ว'
  return 'ยังไม่จ่าย'
}

function formatOptionalAmount(value: string | null, fallback: string) {
  return value === null ? fallback : formatThbMinor(value)
}

function minorToDecimalInput(value: string | null) {
  if (value === null) return ''
  const minor = BigInt(value)
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

function currentInstallmentLabel(
  occurrence: InstallmentOccurrenceData,
  plan: InstallmentPlanData,
) {
  const status = occurrence.closesPlan
    ? 'ปิดยอดแล้ว'
    : occurrence.status === 'paid'
      ? 'จ่ายแล้ว'
      : occurrence.status === 'cancelled'
        ? 'ยกเลิกแล้ว'
        : 'ยังไม่จ่าย'
  return `${occurrence.installmentNumber}/${plan.totalInstallments} · ${status}`
}

function getEndDatePreview(
  firstPaymentDate: string,
  totalInstallments: number,
) {
  try {
    return calculateInstallmentEndDate(firstPaymentDate, totalInstallments)
  } catch {
    return null
  }
}

function formatCardName(card: {
  readonly maskedSuffix: string | null
  readonly name: string
}) {
  return card.maskedSuffix
    ? `${card.name} •••• ${card.maskedSuffix}`
    : card.name
}

function FieldError({
  id,
  message,
}: {
  readonly id: string
  readonly message: string | undefined
}) {
  return message ? (
    <small id={id} role="alert">
      {message}
    </small>
  ) : null
}
