import type { Schedule, Service } from '@pantry-finder/types'

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

export function parseTimeMinutes(t: string): number {
  if (!t) return 0
  const parts = t.trim().split(/\s+/)
  const time = parts[0] ?? ''
  const period = parts[1]
  const [hStr, mStr] = time.split(':')
  let h = Number(hStr)
  const m = Number(mStr ?? '0')
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h * 60 + m
}

export function isOpenNow(schedules: Schedule[], now: Date = new Date()): boolean {
  const today = WEEKDAYS[now.getDay()]
  const minutes = now.getHours() * 60 + now.getMinutes()
  return schedules.some(s =>
    s.weekDay === today && s.start &&
    minutes >= parseTimeMinutes(s.start) && minutes <= parseTimeMinutes(s.end)
  )
}

export function isOpenToday(schedules: Schedule[], now: Date = new Date()): boolean {
  const today = WEEKDAYS[now.getDay()]
  return schedules.some(s => s.weekDay === today && s.start)
}

export function getUniqueFoods(services: Service[]): string[] {
  const foods = new Set<string>()
  for (const s of services) {
    for (const f of s.food) foods.add(f)
  }
  return [...foods]
}

export function getScheduleDays(schedules: Schedule[]): Schedule[] {
  const seen = new Set<string>()
  const out: Schedule[] = []
  for (const s of schedules) {
    if (s.weekDay && s.start && !seen.has(s.weekDay)) {
      seen.add(s.weekDay)
      out.push(s)
    }
  }
  return out
}
