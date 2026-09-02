import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  createCategory,
  getCategories,
  setCategoryStatus,
  type Direction,
} from '../app/api'
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
  const createMutation = useMutation({
    mutationFn: (input: CategoryFormValues) =>
      createCategory(session.csrfToken, input),
    onSuccess: async () => {
      setNotice('เพิ่มหมวดหมู่แล้ว')
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

  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">ตั้งค่ารายการ</p>
        <h1>หมวดหมู่</h1>
        <p>แยกรายรับและรายจ่ายให้ค้นหาและสรุปผลได้ชัดเจน</p>
      </header>

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
            <h2>เพิ่มหมวดหมู่</h2>
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
              autoComplete="off"
              placeholder="เช่น อาหาร (ข้อมูลสมมติ)"
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <small>{form.formState.errors.name.message}</small>
            ) : null}
          </label>

          {createMutation.isError ? (
            <p className="form-error" role="alert">
              {createMutation.error.message}
            </p>
          ) : null}

          {statusMutation.isError ? (
            <p className="form-error" role="alert">
              {statusMutation.error.message}
            </p>
          ) : null}

          <button
            className="primary-button"
            disabled={createMutation.isPending}
            type="submit"
          >
            {createMutation.isPending ? 'กำลังเพิ่ม…' : 'เพิ่มหมวดหมู่'}
          </button>
        </form>

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

          {categoriesQuery.isPending ? (
            <p className="muted-state" aria-busy="true">
              กำลังโหลดหมวดหมู่…
            </p>
          ) : categoriesQuery.isError ? (
            <p className="inline-error" role="alert">
              {categoriesQuery.error.message}
            </p>
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
  return (
    <section>
      <h3>{direction === 'expense' ? 'รายจ่าย' : 'รายรับ'}</h3>
      {items.length === 0 ? (
        <p className="muted-copy">ยังไม่มีหมวดหมู่ประเภทนี้</p>
      ) : (
        <ul className="category-items">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <span>{item.name}</span>
                <small>{item.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</small>
              </div>
              <button
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
