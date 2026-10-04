import type { Season, Settings, TimePeriod } from '../types'

/** 每真实秒推进的游戏分钟数 */
export const TIME_SPEED: Record<Settings['timeMode'], number> = {
  real: 1 / 60,
  slow: 0.5,
  normal: 1,
  fast: 3,
}
export const TIME_MODE_LABEL: Record<Settings['timeMode'], string> = {
  real: '现实时间',
  slow: '悠闲（1天≈48分钟）',
  normal: '标准（1天≈24分钟）',
  fast: '快速（1天≈8分钟）',
}

/** 游戏日历：每月 3 天，一年 12 个月；第 1 天 = 3 月 1 日（春） */
export const DAYS_PER_MONTH = 3
export const START_MONTH = 3

export interface Clock {
  day: number // 第几天（从 1 开始）
  hour: number
  minute: number
  hourF: number // 小时（带小数）
  period: TimePeriod
  month: number
  dayOfMonth: number
  season: Season
  fullMoon: boolean
  specialDay: 'christmas' | 'halloween' | 'newYear' | null
  isNight: boolean
  daylight: number // 0..1
}

export function periodOf(h: number): TimePeriod {
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 11) return 'morning'
  if (h >= 11 && h < 14) return 'noon'
  if (h >= 14 && h < 17) return 'afternoon'
  if (h >= 17 && h < 19) return 'dusk'
  if (h >= 19 && h < 22) return 'night'
  return 'lateNight'
}

export function seasonOfMonth(m: number): Season {
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

function realMoonPhase(d: Date) {
  const synodic = 29.530588853
  const ref = Date.UTC(2000, 0, 6, 18, 14) // 已知新月
  const days = (d.getTime() - ref) / 86400000
  return (((days % synodic) + synodic) % synodic) / synodic
}

function specialOf(month: number, dom: number, real: boolean): Clock['specialDay'] {
  if (real) {
    if (month === 12 && dom >= 20 && dom <= 26) return 'christmas'
    if ((month === 10 && dom >= 25) || (month === 11 && dom <= 2)) return 'halloween'
    if ((month === 12 && dom === 31) || (month === 1 && dom <= 3)) return 'newYear'
    return null
  }
  if (month === 12 && dom >= 2) return 'christmas'
  if ((month === 10 && dom === 3) || (month === 11 && dom === 1)) return 'halloween'
  if (month === 1 && dom <= 2) return 'newYear'
  return null
}

export function daylightOf(h: number) {
  // 5~7 日出，17~19.5 日落
  if (h < 5 || h >= 19.5) return 0
  if (h < 7) return (h - 5) / 2
  if (h < 17) return 1
  return 1 - (h - 17) / 2.5
}

export function computeClock(gameMinutes: number, realSeason: boolean): Clock {
  const day = Math.floor(gameMinutes / 1440) + 1
  const mod = gameMinutes - (day - 1) * 1440
  const hour = Math.floor(mod / 60)
  const minute = Math.floor(mod % 60)
  const hourF = mod / 60
  let month: number
  let dom: number
  let fullMoon: boolean
  if (realSeason) {
    const now = new Date()
    month = now.getMonth() + 1
    dom = now.getDate()
    const ph = realMoonPhase(now)
    fullMoon = ph > 0.45 && ph < 0.55
  } else {
    const idx = day - 1
    month = ((Math.floor(idx / DAYS_PER_MONTH) + START_MONTH - 1) % 12) + 1
    dom = (idx % DAYS_PER_MONTH) + 1
    fullMoon = day % 8 === 4
  }
  const period = periodOf(hourF)
  return {
    day,
    hour,
    minute,
    hourF,
    period,
    month,
    dayOfMonth: dom,
    season: seasonOfMonth(month),
    fullMoon,
    specialDay: specialOf(month, dom, realSeason),
    isNight: hourF >= 19.5 || hourF < 5,
    daylight: daylightOf(hourF),
  }
}

/** 当前真实时刻对应的“当天分钟” */
export function realMinuteOfDay() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

export function fmtTime(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function fmtGameStamp(gm: number) {
  const c = computeClock(gm, false)
  return fmtTime(c.hour, c.minute)
}
