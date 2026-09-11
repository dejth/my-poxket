import { QueryError } from '../app/QueryError'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  createCategory,
  getCategories,
  setCategoryStatus,
  type Direction,
} from '../app/api'
import { ActionNotice } from '../app/ActionNotice'
import { Icon } from '../app/Icon'
import { Modal } from '../app/Modal'
import { useAuthenticatedContext } from '../app/authenticated-context'

const CATEGORIES_QUERY_KEY = ['categories'] as const
const categorySchema = z.object({
  direction: z.enum(['income', 'expense']),
  name: z.string().trim().min(1, 'กรุณาระบุชื่อหมวดหมู่').max(100),
})
type CategoryFormValues = z.infer<typeof categorySchema>

export function CategoriesPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const categoriesQuery = useQuery({
    queryFn: getCategories,
    queryKey: CATEGORIES_QUERY_KEY,
  })
  const form = useForm<CategoryFormValues>({
    defaultValues: { direction: 'expense', name: '' },
    resolver: zodResolver(categorySchema),
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [isFormOpen, setFormOpen] = useState(false)
  const createMutation = useMutation({
    mutationFn: (input: CategoryFormValues) =>
      createCategory(session.csrfToken, input),
    onSuccess: async () => {
      setNotice('เพิ่มหมวดหมู่แล้ว')
      setFormOpen(false)
      form.reset({ direction: form.getValues('direction'), name: '' })
      await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY })
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setCategoryStatus(session.csrfToken, id, isActive),
    onSuccess: async (_, variables) => {
      setNotice(
        variables.isActive ? 'เปิดใช้งานหมวดหมู่แล้ว' : 'ปิดใช้งานหมวดหมู่แล้ว',
      )
      await queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY })
    },
  })

  const categories = categoriesQuery.data ?? []

  return (
    <main className="page-shell">
      <header className="page-header page-header-actions">
        <div>
          <p className="eyebrow">ตั้งค่ารายการ</p>
          <h1>หมวดหมู่</h1>
          <p>แยกรายรับและรายจ่ายให้ค้นหาและสรุปผลได้ชัดเจน</p>
        </div>
        <button
          className="primary-button action-button"
          onClick={() => {
            createMutation.reset()
            form.reset({ direction: 'expense', name: '' })
            setFormOpen(true)
          }}
          type="button"
        >
          <Icon name="plus-lg" /> เพิ่มหมวดหมู่
        </button>
      </header>

      <ActionNotice message={notice} setMessage={setNotice} />

      {isFormOpen ? (
        <Modal
          labelledBy="category-form-title"
          onClose={() => {
            if (!createMutation.isPending) setFormOpen(false)
          }}
        >
          <form
            aria-labelledby="category-form-title"
            className="form-dialog transaction-form"
            onSubmit={(event) => {
              void form.handleSubmit((values) => createMutation.mutate(values))(
                event,
              )
            }}
          >
            <div className="dialog-heading">
              <h2 id="category-form-title">เพิ่มหมวดหมู่</h2>
              <button
                aria-label="ปิด"
                className="icon-button"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                <Icon name="x-lg" />
              </button>
            </div>

            <fieldset className="segmented-field">
              <legend>ประเภท</legend>
              <label>
                <input
                  type="radio"
                  value="expense"
                  {...form.register('direction')}
                />
                รายจ่าย
              </label>
              <label>
                <input
                  type="radio"
                  value="income"
                  {...form.register('direction')}
                />
                รายรับ
              </label>
            </fieldset>

            <label className="field">
              ชื่อหมวดหมู่
              <input
                aria-invalid={Boolean(form.formState.errors.name)}
                aria-describedby={
                  form.formState.errors.name
                    ? 'CategoriesPage-name-error'
                    : undefined
                }
                autoComplete="off"
                placeholder="เช่น อาหาร (ข้อมูลสมมติ)"
                {...form.register('name')}
              />
              {form.formState.errors.name ? (
                <small id="CategoriesPage-name-error" role="alert">
                  {form.formState.errors.name.message}
                </small>
              ) : null}
            </label>

            {createMutation.isError ? (
              <p className="form-error" role="alert">
                {createMutation.error.message}
              </p>
            ) : null}

            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                ยกเลิก
              </button>
              <button
                className="primary-button"
                disabled={createMutation.isPending}
                type="submit"
              >
                {createMutation.isPending ? 'กำลังเพิ่ม…' : 'เพิ่มหมวดหมู่'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <section
        className="surface category-list"
        aria-labelledby="category-list-title"
      >
        <div className="section-heading">
          <div>
            <h2 id="category-list-title">หมวดหมู่ทั้งหมด</h2>
            <p>{categories.length} รายการ</p>
          </div>
        </div>

        {statusMutation.isError ? (
          <p className="inline-error" role="alert">
            {statusMutation.error.message}
          </p>
        ) : null}

        {categoriesQuery.isPending ? (
          <p className="muted-state" aria-busy="true" role="status">
            กำลังโหลดหมวดหมู่…
          </p>
        ) : categoriesQuery.isError ? (
          <QueryError
            message={categoriesQuery.error.message}
            onRetry={() => {
              void categoriesQuery.refetch()
            }}
          />
        ) : categories.length === 0 ? (
          <p className="muted-state">ยังไม่มีหมวดหมู่ เพิ่มรายการแรกได้เลย</p>
        ) : (
          <div className="category-groups">
            {(['expense', 'income'] as const).map((direction) => (
              <CategoryGroup
                direction={direction}
                isUpdating={statusMutation.isPending}
                key={direction}
                items={categories.filter(
                  (category) => category.direction === direction,
                )}
                onToggle={(id, isActive) => {
                  if (
                    isActive ||
                    window.confirm(
                      'ปิดหมวดหมู่นี้ใช่หรือไม่ ประวัติรายการเดิมจะยังคงอยู่',
                    )
                  ) {
                    statusMutation.mutate({ id, isActive })
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function CategoryGroup({
  direction,
  isUpdating,
  items,
  onToggle,
}: {
  readonly direction: Direction
  readonly isUpdating: boolean
  readonly items: readonly {
    id: string
    isActive: boolean
    name: string
  }[]
  readonly onToggle: (id: string, isActive: boolean) => void
}) {
  const titleId = `category-group-${direction}`
  return (
    <section aria-labelledby={titleId}>
      <div className="category-group-heading">
        <h3 id={titleId}>{direction === 'expense' ? 'รายจ่าย' : 'รายรับ'}</h3>
        <span>{items.length} รายการ</span>
      </div>
      {items.length === 0 ? (
        <p className="muted-copy">ยังไม่มีหมวดหมู่ประเภทนี้</p>
      ) : (
        <ul className="category-items">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong className="category-item-name">{item.name}</strong>
                <span
                  className={`status-label ${item.isActive ? 'active' : 'stopped'}`}
                >
                  {item.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                </span>
              </div>
              <button
                aria-label={`${item.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}หมวดหมู่ ${item.name}`}
                className="small-button"
                disabled={isUpdating}
                onClick={() => onToggle(item.id, !item.isActive)}
                type="button"
              >
                {item.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
