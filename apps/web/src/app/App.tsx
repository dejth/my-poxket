import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getSession, login, logout } from './api'
import type { LoginInput, SessionData } from './api'
import { DashboardPage } from '../pages/DashboardPage'
import { LoginPage } from '../pages/LoginPage'

const SESSION_QUERY_KEY = ['session'] as const

export function App() {
  const queryClient = useQueryClient()
  const sessionQuery = useQuery({
    queryFn: getSession,
    queryKey: SESSION_QUERY_KEY,
  })
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, session)
    },
  })
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData<SessionData | null>(SESSION_QUERY_KEY, null)
    },
  })

  if (sessionQuery.isPending) {
    return (
      <main className="centered-state" aria-busy="true">
        <p>กำลังเตรียม My Poxket…</p>
      </main>
    )
  }

  if (sessionQuery.isError) {
    return (
      <main className="centered-state" role="alert">
        <div className="service-error">
          <p className="eyebrow">เชื่อมต่อไม่สำเร็จ</p>
          <h1>ไม่สามารถติดต่อ My Poxket API ได้</h1>
          <p>ตรวจว่า Node API และ MariaDB ทำงานอยู่ แล้วลองโหลดหน้านี้ใหม่</p>
        </div>
      </main>
    )
  }

  if (sessionQuery.data) {
    const session = sessionQuery.data
    return (
      <DashboardPage
        isSigningOut={logoutMutation.isPending}
        onSignOut={() => logoutMutation.mutate(session.csrfToken)}
        session={session}
      />
    )
  }

  return (
    <LoginPage
      errorMessage={loginMutation.error?.message}
      isSubmitting={loginMutation.isPending}
      onSubmit={(input: LoginInput) => loginMutation.mutate(input)}
    />
  )
}
