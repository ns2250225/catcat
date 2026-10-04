import type { Season, WeatherType } from '../types'
import { RAINY } from '../types'
import { pickWeighted, randInt } from '../core/rng'

/** 各季节天气权重 */
const WEIGHTS: Record<Season, Partial<Record<WeatherType, number>>> = {
  spring: { sunny: 30, cloudy: 24, overcast: 12, lightRain: 14, heavyRain: 5, storm: 2, fog: 7, windy: 8 },
  summer: { sunny: 40, cloudy: 18, overcast: 6, lightRain: 8, heavyRain: 8, storm: 10, fog: 2, windy: 4 },
  autumn: { sunny: 30, cloudy: 22, overcast: 14, lightRain: 10, heavyRain: 4, storm: 2, fog: 8, windy: 12 },
  winter: { sunny: 24, cloudy: 18, overcast: 18, lightRain: 4, heavyRain: 1, fog: 8, windy: 8, snow: 22 },
}

export function nextWeather(season: Season, prev: WeatherType, hour: number): { type: WeatherType; duration: number } {
  // 雨后彩虹（白天、雨停时）
  if (RAINY.includes(prev) && hour >= 7 && hour <= 17 && Math.random() < 0.35) {
    return { type: 'rainbow', duration: randInt(30, 60) }
  }
  const w = WEIGHTS[season]
  const types = Object.keys(w) as WeatherType[]
  const type =
    pickWeighted(types, (t) => {
      let v = w[t] ?? 0
      // 天气具有连续性
      if (t === prev) v *= 1.6
      if (prev === 'storm' && t === 'heavyRain') v *= 2
      if (prev === 'heavyRain' && t === 'lightRain') v *= 2
      if (t === 'fog' && !(hour >= 4 && hour <= 10)) v *= 0.3
      return v
    }) ?? 'sunny'
  const duration = type === 'storm' ? randInt(40, 120) : randInt(70, 260)
  return { type, duration }
}

export function temperatureOf(season: Season, hourF: number, w: WeatherType) {
  const base = { spring: 17, summer: 29, autumn: 18, winter: 3 }[season]
  const diurnal = Math.cos(((hourF - 14) / 24) * Math.PI * 2) * 5
  const off: Partial<Record<WeatherType, number>> = {
    sunny: 2, lightRain: -2, heavyRain: -4, storm: -4, snow: -5, fog: -1, windy: -2, overcast: -1,
  }
  return Math.round(base + diurnal + (off[w] ?? 0))
}

export const isRainy = (w: WeatherType) => RAINY.includes(w)
