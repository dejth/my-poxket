import type { SessionData } from '../app/api'

interface DashboardPageProps {
  readonly isSigningOut: boolean
  readonly onSignOut: () => void
  readonly session: SessionData
}

export function DashboardPage({
  isSigningOut,
  onSignOut,
  session,
}: DashboardPageProps) {
  return (
    <main className="dashboard-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MY POXKET</p>
          <h1>ภาพรวมการเงิน</h1>
        </div>
        <div className="account-actions">
          <span>{session.user.username}</span>
          <button
            className="secondary-button"
            disabled={isSigningOut}
            onClick={onSignOut}
            type="button"
          >
            {isSigningOut ? 'กำลังออก…' : 'ออกจากระบบ'}
          </button>
        </div>
      </header>

      <section className="empty-dashboard" aria-labelledby="ready-title">
        <p className="status-pill">Foundation ready</p>
        <h2 id="ready-title">พร้อมเริ่มบันทึกรายการใน Phase ถัดไป</h2>
        <p>
          Authentication, THB, Asia/Bangkok และฐานข้อมูล development
          ถูกวางโครงสร้างไว้แล้ว
        </p>
      </section>
    </main>
  )
}
