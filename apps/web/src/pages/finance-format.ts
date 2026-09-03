export function formatThbMinor(value: string): string {
  const minor = BigInt(value)
  const whole = minor / 100n
  const fraction = (minor % 100n).toString().padStart(2, '0')
  return `฿${new Intl.NumberFormat('th-TH').format(whole)}.${fraction}`
}

export function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00+07:00`))
}

export function todayInBangkok(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(new Date())
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )
  return `${values.year}-${values.month}-${values.day}`
}
