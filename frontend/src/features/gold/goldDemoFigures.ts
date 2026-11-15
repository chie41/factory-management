/** UI-only demonstration figures, never sourced from real sessions. */
export const GOLD_DEMO_BASE_TOTAL = 5841.87
export const GOLD_DEMO_PREVIOUS = 5840.00
export function isGoldDemoDate(date: string): boolean {
  const today = new Date()
  const currentMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0')
  return date === '2026-09-29' || (date.startsWith(currentMonth) && date <= currentMonth + '-' + String(today.getDate()).padStart(2, '0'))
}
export function goldDemoOffset(date: string): number {
  const day = Number(date.slice(8, 10))
  return ((day % 7) * 3)
}
export function goldDemoTotal(date: string): string {
  return (GOLD_DEMO_BASE_TOTAL + goldDemoOffset(date)).toFixed(2)
}
export function goldDemoDifference(date: string): string {
  return (GOLD_DEMO_BASE_TOTAL + goldDemoOffset(date) - GOLD_DEMO_PREVIOUS).toFixed(2)
}
