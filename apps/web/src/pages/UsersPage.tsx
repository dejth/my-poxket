import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { ActionNotice } from '../app/ActionNotice'
import { Icon } from '../app/Icon'
import { Modal } from '../app/Modal'
import { QueryError } from '../app/QueryError'
import { getUsers, saveUser, type UserData, type UserInput } from '../app/api'
import { useAuthenticatedContext } from '../app/authenticated-context'

export function UsersPage() {
  const { session } = useAuthenticatedContext()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<UserData | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [validationError, setValidationError] = useState('')
  const [isFormOpen, setFormOpen] = useState(false)
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
      setFormOpen(false)
      setValidationError('')
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
      <header className="page-header page-header-actions">
        <div>
          <p className="eyebrow">ตั้งค่าบัญชี</p>
          <h1>ผู้ใช้</h1>
          <p>ผู้ใช้ทุกบัญชีใช้งานข้อมูลการเงินชุดเดียวกัน</p>
        </div>
        <button
          className="primary-button action-button"
          onClick={() => {
            setEditing(null)
            mutation.reset()
            setValidationError('')
            setFormOpen(true)
          }}
          type="button"
        >
          <Icon name="plus-lg" /> เพิ่มผู้ใช้
        </button>
      </header>
      <ActionNotice message={notice} setMessage={setNotice} />
      {isFormOpen ? (
        <Modal
          labelledBy="user-form-title"
          onClose={() => {
            if (!mutation.isPending) setFormOpen(false)
          }}
        >
          <form
            aria-labelledby="user-form-title"
            className="form-dialog transaction-form users-layout"
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
                setValidationError(
                  'กรุณาระบุชื่อและชื่อผู้ใช้อย่างน้อย 3 ตัวอักษร',
                )
                return
              }
              setValidationError('')
              mutation.mutate({
                input: { name, username, ...(password ? { password } : {}) },
                ...(editing ? { id: editing.id } : {}),
              })
            }}
          >
            <div className="dialog-heading">
              <h2 id="user-form-title">
                {editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}
              </h2>
              <button
                aria-label="ปิด"
                className="icon-button"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                <Icon name="x-lg" />
              </button>
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
            {validationError ? (
              <p className="form-error" role="alert">
                {validationError}
              </p>
            ) : null}
            {mutation.error ? (
              <p className="form-error" role="alert">
                {mutation.error.message}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={mutation.isPending}
                onClick={() => {
                  setEditing(null)
                  mutation.reset()
                  setValidationError('')
                  setFormOpen(false)
                }}
                type="button"
              >
                ยกเลิก
              </button>
              <button
                className="primary-button"
                disabled={mutation.isPending}
                type="submit"
              >
                {mutation.isPending ? 'กำลังบันทึก…' : 'บันทึกผู้ใช้'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      <section
        aria-labelledby="users-list-title"
        className="surface category-list"
      >
        <div className="section-heading">
          <div>
            <h2 id="users-list-title">ผู้ใช้ทั้งหมด</h2>
            {usersQuery.data ? <p>{usersQuery.data.length} บัญชี</p> : null}
          </div>
        </div>
        {usersQuery.isPending ? (
          <p className="muted-state" aria-busy="true" role="status">
            กำลังโหลดผู้ใช้…
          </p>
        ) : usersQuery.isError ? (
          <QueryError
            message={usersQuery.error.message}
            onRetry={() => {
              void usersQuery.refetch()
            }}
          />
        ) : (
          <ul className="user-items">
            {usersQuery.data.map((user) => (
              <li key={user.id}>
                <div className="user-identity">
                  <strong>{user.name}</strong>
                  <span>@{user.username}</span>
                </div>
                <button
                  aria-label={`แก้ไข ${user.name}`}
                  className="small-button"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setEditing(user)
                    setFormOpen(true)
                    mutation.reset()
                    setNotice('')
                    setValidationError('')
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
    </main>
  )
}
