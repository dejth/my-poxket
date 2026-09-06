import { QueryError } from '../app/QueryError'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { ActionNotice } from '../app/ActionNotice'
import {
  createCreditCard,
  getCreditCards,
  getCreditCardStatements,
  setCreditCardStatus,
  type CreditCardStatementData,
} from '../app/api'
import { useAuthenticatedContext } from '../app/authenticated-context'
import {
  formatThaiDate,
  formatThbMinor,
  todayInBangkok,
} from './finance-format'

const creditCardSchema = z.object({
  cutoffDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  maskedSuffix: z
    .string()
    .regex(/^(?:\d{4})?$/, 'ระบุเลขท้าย 4 หลัก หรือเว้นว่าง'),
  name: z.string().trim().min(1, 'กรุณาระบุชื่อบัตร').max(100),
})
type CreditCardFormValues = z.infer<typeof creditCardSchema>

interface StatementFilters {
  readonly cardId?: string | undefined
  readonly dateFrom: string
  readonly dateTo: string
}

export function CreditCardsPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const [filters, setFilters] = useState(currentYearRange)
  const [draftFilters, setDraftFilters] = useState(currentYearRange)
  const cardsQuery = useQuery({
    queryFn: getCreditCards,
    queryKey: ['credit-cards'],
  })
  const statementsQuery = useQuery({
    queryFn: () => getCreditCardStatements(filters),
    queryKey: ['credit-card-statements', filters],
  })
  const form = useForm<CreditCardFormValues>({
    defaultValues: { cutoffDay: 17, dueDay: 1, maskedSuffix: '', name: '' },
    resolver: zodResolver(creditCardSchema),
  })
  const createMutation = useMutation({
    mutationFn: (values: CreditCardFormValues) =>
      createCreditCard(session.csrfToken, {
        cutoffDay: values.cutoffDay,
        dueDay: values.dueDay,
        ...(values.maskedSuffix ? { maskedSuffix: values.maskedSuffix } : {}),
        name: values.name,
      }),
    onSuccess: async () => {
      setNotice('เพิ่มบัตรเครดิตแล้ว')
      form.reset({ cutoffDay: 17, dueDay: 1, maskedSuffix: '', name: '' })
      await queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setCreditCardStatus(session.csrfToken, id, isActive),
    onSuccess: async (_, variables) => {
      setNotice(variables.isActive ? 'เปิดใช้งานบัตรแล้ว' : 'ปิดใช้งานบัตรแล้ว')
      await queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
    },
  })

  const cards = cardsQuery.data ?? []
  const statements = statementsQuery.data ?? []

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">รอบบัตรและยอดชำระ</p>
        <h1>บัตรเครดิต</h1>
        <p>แยกวันครบกำหนดของผู้ให้บริการออกจากวันที่วางแผนชำระ</p>
      </header>

      <ActionNotice message={notice} setMessage={setNotice} />

      <section className="category-layout">
        <form
          className="surface compact-form"
          onSubmit={(event) => {
            void form.handleSubmit((values) => createMutation.mutate(values))(
              event,
            )
          }}
        >
          <div className="section-heading">
            <h2>เพิ่มบัตร</h2>
          </div>

          <label className="field">
            ชื่อบัตร
            <input
              aria-invalid={Boolean(form.formState.errors.name)}
              aria-describedby={
                form.formState.errors.name
                  ? 'CreditCardsPage-name-error'
                  : undefined
              }
              autoComplete="off"
              placeholder="เช่น บัตรตัวอย่าง"
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <small id="CreditCardsPage-name-error" role="alert">
                {form.formState.errors.name.message}
              </small>
            ) : null}
          </label>

          <label className="field">
            เลขท้ายบัตร (ไม่บังคับ)
            <input
              aria-invalid={Boolean(form.formState.errors.maskedSuffix)}
              aria-describedby={
                form.formState.errors.maskedSuffix
                  ? 'CreditCardsPage-maskedSuffix-error'
                  : undefined
              }
              autoComplete="off"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              {...form.register('maskedSuffix')}
            />
            {form.formState.errors.maskedSuffix ? (
              <small id="CreditCardsPage-maskedSuffix-error" role="alert">
                {form.formState.errors.maskedSuffix.message}
              </small>
            ) : null}
          </label>

          <div className="card-rule-grid">
            <label className="field">
              วันสรุปยอด
              <input
                aria-invalid={Boolean(form.formState.errors.cutoffDay)}
                aria-describedby={
                  form.formState.errors.cutoffDay
                    ? 'CreditCardsPage-cutoffDay-error'
                    : undefined
                }
                inputMode="numeric"
                max={31}
                min={1}
                type="number"
                {...form.register('cutoffDay', { valueAsNumber: true })}
              />
              {form.formState.errors.cutoffDay ? (
                <small id="CreditCardsPage-cutoffDay-error" role="alert">
                  ระบุวันที่ 1–31
                </small>
              ) : null}
            </label>
            <label className="field">
              วันครบกำหนด
              <input
                aria-invalid={Boolean(form.formState.errors.dueDay)}
                aria-describedby={
                  form.formState.errors.dueDay
                    ? 'CreditCardsPage-dueDay-error'
                    : undefined
                }
                inputMode="numeric"
                max={31}
                min={1}
                type="number"
                {...form.register('dueDay', { valueAsNumber: true })}
              />
              {form.formState.errors.dueDay ? (
                <small id="CreditCardsPage-dueDay-error" role="alert">
                  ระบุวันที่ 1–31
                </small>
              ) : null}
            </label>
          </div>

          {createMutation.isError || statusMutation.isError ? (
            <p className="form-error" role="alert">
              {createMutation.error?.message ?? statusMutation.error?.message}
            </p>
          ) : null}

          <button
            className="primary-button"
            disabled={createMutation.isPending}
            type="submit"
          >
            {createMutation.isPending ? 'กำลังเพิ่ม…' : 'เพิ่มบัตร'}
          </button>
        </form>

        <section
          className="surface category-list"
          aria-labelledby="cards-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="cards-title">บัตรทั้งหมด</h2>
              <p>{cards.length} ใบ</p>
            </div>
          </div>

          {cardsQuery.isPending ? (
            <p className="muted-state" aria-busy="true" role="status">
              กำลังโหลดบัตร…
            </p>
          ) : cardsQuery.isError ? (
            <QueryError
              message={cardsQuery.error.message}
              onRetry={() => {
                void cardsQuery.refetch()
              }}
            />
          ) : cards.length === 0 ? (
            <p className="muted-state">ยังไม่มีบัตรเครดิต</p>
          ) : (
            <ul className="category-items card-items">
              {cards.map((card) => (
                <li key={card.id}>
                  <div>
                    <strong>{formatCardName(card)}</strong>
                    <small>
                      สรุปวันที่ {card.cutoffDay} · ครบกำหนดวันที่ {card.dueDay}{' '}
                      · {card.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                    </small>
                  </div>
                  <button
                    className="small-button"
                    disabled={statusMutation.isPending}
                    onClick={() => {
                      const isActive = !card.isActive
                      if (
                        isActive ||
                        window.confirm(
                          'ปิดบัตรนี้ใช่หรือไม่ ประวัติรายการเดิมจะยังคงอยู่',
                        )
                      ) {
                        statusMutation.mutate({ id: card.id, isActive })
                      }
                    }}
                    type="button"
                  >
                    {card.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <section className="statement-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ยอดจากรายการที่ยังใช้งาน</p>
            <h2>รอบบัญชี</h2>
          </div>
        </div>

        <form
          className="surface filter-bar statement-filter"
          onSubmit={(event) => {
            event.preventDefault()
            setFilters(draftFilters)
          }}
        >
          <label>
            บัตร
            <select
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  cardId: event.target.value || undefined,
                }))
              }
              value={draftFilters.cardId ?? ''}
            >
              <option value="">ทุกบัตร</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {formatCardName(card)}
                </option>
              ))}
            </select>
          </label>
          <label>
            ตั้งแต่วันสรุปยอด
            <input
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
              type="date"
              value={draftFilters.dateFrom}
            />
          </label>
          <label>
            ถึงวันสรุปยอด
            <input
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
              type="date"
              value={draftFilters.dateTo}
            />
          </label>
          <button className="secondary-button" type="submit">
            แสดงรอบบัญชี
          </button>
        </form>

        <section
          className="surface transaction-surface"
          aria-label="รอบบัญชีบัตรเครดิต"
        >
          {statementsQuery.isPending ? (
            <p className="muted-state" aria-busy="true" role="status">
              กำลังคำนวณรอบบัญชี…
            </p>
          ) : statementsQuery.isError ? (
            <QueryError
              message={statementsQuery.error.message}
              onRetry={() => {
                void statementsQuery.refetch()
              }}
            />
          ) : statements.length === 0 ? (
            <div className="empty-list">
              <h2>ยังไม่มียอดบัตรในช่วงนี้</h2>
              <p>ยอดจะปรากฏเมื่อมีรายการชำระด้วยบัตรเครดิต</p>
            </div>
          ) : (
            <StatementLists statements={statements} />
          )}
        </section>
      </section>
    </main>
  )
}

function StatementLists({
  statements,
}: {
  readonly statements: readonly CreditCardStatementData[]
}) {
  return (
    <>
      <div className="desktop-transaction-table statement-table">
        <table>
          <thead>
            <tr>
              <th>บัตร</th>
              <th>วันสรุปยอด</th>
              <th>ครบกำหนด</th>
              <th>วางแผนชำระ</th>
              <th>รายการ</th>
              <th className="amount-cell">ยอดรวม</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((statement) => (
              <tr key={`${statement.cardId}:${statement.statementEndDate}`}>
                <td>{formatCardName(statement)}</td>
                <td>{formatThaiDate(statement.statementEndDate)}</td>
                <td>{formatThaiDate(statement.officialDueDate)}</td>
                <td>{formatThaiDate(statement.plannedPaymentDate)}</td>
                <td>{statement.purchaseCount}</td>
                <td className="amount-cell expense">
                  {formatThbMinor(statement.amountMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-transaction-cards">
        {statements.map((statement) => (
          <article
            className="transaction-card statement-card"
            key={`${statement.cardId}:${statement.statementEndDate}`}
          >
            <div className="transaction-card-main">
              <div>
                <h2>{formatCardName(statement)}</h2>
                <p>สรุปยอด {formatThaiDate(statement.statementEndDate)}</p>
              </div>
              <strong className="expense">
                {formatThbMinor(statement.amountMinor)}
              </strong>
            </div>
            <dl className="statement-dates">
              <div>
                <dt>ครบกำหนด</dt>
                <dd>{formatThaiDate(statement.officialDueDate)}</dd>
              </div>
              <div>
                <dt>วางแผนชำระ</dt>
                <dd>{formatThaiDate(statement.plannedPaymentDate)}</dd>
              </div>
              <div>
                <dt>จำนวนรายการ</dt>
                <dd>{statement.purchaseCount}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  )
}

function formatCardName(card: {
  readonly maskedSuffix: string | null
  readonly name?: string
  readonly cardName?: string
}) {
  const name = card.name ?? card.cardName ?? ''
  return card.maskedSuffix ? `${name} •••• ${card.maskedSuffix}` : name
}

function currentYearRange(): StatementFilters {
  const year = todayInBangkok().slice(0, 4)
  return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` }
}
