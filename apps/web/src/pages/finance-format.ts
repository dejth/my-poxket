export function formatThbMinor(value: string): string {
  const minor = BigInt(value)
  const whole = minor / 100n
  const fraction = (minor % 100n).toString().padStart(2, '0')
  return `฿${new Intl.NumberFormat('th-TH').format(whole)}.${fraction}`
}
