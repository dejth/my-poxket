import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { getUsers, saveUser, type UserData, type UserInput } from '../app/api'
import { useAuthenticatedContext } from '../app/authenticated-context'

export function UsersPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<UserData | null>(null)
  const [notice, setNotice] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const isOwner = session.user.role === 'owner'
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: isOwner,
  })
  const mutation = useMutation({
    mutationFn: ({ input, id }: { input: UserInput; id?: string }) =>
      saveUser(session.csrfToken, input, id),
    onSuccess: async (result) => {
      formRef.current?.reset()
      setEditing(null)
      if (result.requiresLogin) {
        queryClient.clear()
        window.location.assign('/')
        return
      }
      setNotice('บันทึกผู้ใช้แล้ว')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ])
      nameRef.current?.focus()
    },
  })

  if (!isOwner)
    return (
      <main className="page-shell">
        <h1>ผู้ใช้</h1>
        <p>เฉพาะเจ้าของบัญชีเท่านั้นที่จัดการผู้ใช้ได้</p>
      </main>
    )

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">ตั้งค่าบัญชี</p>
        <h1>ผู้ใช้</h1>
        <p>ผู้ใช้ทุกบัญชีใช้งานข้อมูลการเงินชุดเดียวกัน</p>
      </header>
      {notice ? <p role="status">{notice}</p> : null}
      <div className="category-layout users-layout">
        <form
          className="surface compact-form"
          key={editing?.id ?? 'new'}
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const rawName = data.get('name')
            const rawUsername = data.get('username')
            const password = data.get('password')
            if (
              typeof rawName !== 'string' ||
              typeof rawUsername !== 'string' ||
              typeof password !== 'string'
            )
              return
            const name = rawName.trim()
            const username = rawUsername.trim()
            if (!name || username.length < 3) {
              setNotice('กรุณาระบุชื่อและชื่อผู้ใช้อย่างน้อย 3 ตัวอักษร')
              return
            }
            setNotice('')
            mutation.mutate({
              input: { name, username, ...(password ? { password } : {}) },
              ...(editing ? { id: editing.id } : {}),
            })
          }}
        >
          <div className="section-heading">
            <h2>{editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</h2>
          </div>
          <label className="field">
            ชื่อ
            <input
              autoComplete="name"
              defaultValue={editing?.name ?? ''}
              maxLength={100}
              name="name"
              ref={nameRef}
              required
            />
          </label>
          <label className="field">
            Username
            <input
              autoCapitalize="none"
              autoComplete="off"
              defaultValue={editing?.username ?? ''}
              maxLength={64}
              minLength={3}
              name="username"
              required
              spellCheck={false}
            />
          </label>
          <label className="field">
            {editing ? 'Password ใหม่' : 'Password'}
            <input
              aria-describedby="user-password-hint"
              autoComplete="new-password"
              maxLength={256}
              minLength={12}
              name="password"
              required={!editing}
              type="password"
            />
          </label>
          <p className="muted-copy" id="user-password-hint">
            {editing
              ? 'เว้นว่างเพื่อใช้รหัสผ่านเดิม หากเปลี่ยน ผู้ใช้นี้ต้องเข้าสู่ระบบใหม่'
              : 'อย่างน้อย 12 ตัวอักษร'}
          </p>
          {mutation.error ? (
            <p className="form-error" role="alert">
              {mutation.error.message}
            </p>
          ) : null}
          <button
            className="primary-button"
            disabled={mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? 'กำลังบันทึก…' : 'บันทึกผู้ใช้'}
          </button>
          {editing ? (
            <button
              className="text-button"
              disabled={mutation.isPending}
              onClick={() => {
                setEditing(null)
                mutation.reset()
                setNotice('')
              }}
              type="button"
            >
              ยกเลิกการแก้ไข
            </button>
          ) : null}
        </form>
        <section
          aria-labelledby="users-list-title"
          className="surface category-list"
        >
          <div className="section-heading">
            <h2 id="users-list-title">ผู้ใช้ทั้งหมด</h2>
          </div>
          {usersQuery.isPending ? (
            <p role="status">กำลังโหลดผู้ใช้…</p>
          ) : usersQuery.isError ? (
            <div role="alert">
              <p>{usersQuery.error.message}</p>
              <button
                className="small-button"
                onClick={() => {
                  void usersQuery.refetch()
                }}
                type="button"
              >
                ลองอีกครั้ง
              </button>
            </div>
          ) : (
            <ul className="category-items">
              {usersQuery.data.map((user) => (
                <li key={user.id}>
                  <div>
                    <span>{user.name}</span>
                    <small>{user.username}</small>
                  </div>
                  <button
                    aria-label={`แก้ไข ${user.name}`}
                    className="small-button"
                    disabled={mutation.isPending}
                    onClick={() => {
                      setEditing(user)
                      mutation.reset()
                      setNotice('')
                      requestAnimationFrame(() => {
                        nameRef.current?.focus()
                        formRef.current?.scrollIntoView({ block: 'start' })
                      })
                    }}
                    type="button"
                  >
                    แก้ไข
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
