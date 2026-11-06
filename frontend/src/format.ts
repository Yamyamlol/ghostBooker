export const money = (amount: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

// '2026-12-07T06:15:00' -> '06:15', with '+1' when it falls after the travel date
export function clock(isoLocal: string, travelDate: string) {
  const [day, time = ''] = isoLocal.split('T')
  const hhmm = time.slice(0, 5)
  const days = Math.round((Date.parse(day) - Date.parse(travelDate)) / 86_400_000)
  return days > 0 ? `${hhmm}+${days}` : hhmm
}

export const localDate = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA')
}
