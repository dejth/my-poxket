export function DashboardPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">MY POXKET</p>
        <h1>ภาพรวมการเงิน</h1>
      </header>

      <section className="empty-dashboard" aria-labelledby="ready-title">
        <p className="status-pill">พร้อมใช้งาน</p>
        <h2 id="ready-title">เริ่มบันทึกรายรับและรายจ่ายได้แล้ว</h2>
        <p>ข้อมูลกิจกรรมรายเดือนและยอดที่ต้องจ่ายจะเพิ่มใน Phase ถัดไป</p>
      </section>
    </main>
  )
}
