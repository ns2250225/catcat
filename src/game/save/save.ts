import type { SaveData } from '../types'

export const SAVE_VERSION = 1
const DB_NAME = 'stray-cat-yard'
const STORE = 'save'
const KEY = 'main'

export function defaultSave(): SaveData {
  const now = Date.now()
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastActive: now,
    gameMinutes: 7 * 60, // 第1天 07:00
    yardLevel: 1,
    hearts: 0,
    buildings: [],
    nextUid: 1,
    warehouse: { old_bowl: 1, water_bowl: 1, cardboard_box: 1 },
    inventory: {},
    foodStock: { kibble: 9999, fish: 2, canned: 0, treat: 0 },
    cats: {},
    relationships: {},
    randomSeen: 0,
    stats: {},
    achievements: {},
    log: [],
    weather: { type: 'sunny', until: 7 * 60 + 180, prev: 'sunny' },
    seasonFirstSnow: {},
    tutorialStep: 0,
    settings: {
      bgm: 0.5,
      ambient: 0.6,
      sfx: 0.7,
      bgmOn: true,
      timeMode: 'normal',
      realSeason: false,
      showGrid: false,
      bubbles: true,
      pixelScale: 'auto',
      godMode: false,
    },
    gifts: [],
    trash: [],
    seenEvents: {},
  }
}

/** 兼容旧存档：补齐缺失字段 */
export function migrate(raw: any): SaveData {
  const def = defaultSave()
  const s = { ...def, ...raw } as SaveData
  s.settings = { ...def.settings, ...(raw?.settings ?? {}) }
  s.foodStock = { ...def.foodStock, ...(raw?.foodStock ?? {}) }
  s.weather = { ...def.weather, ...(raw?.weather ?? {}) }
  for (const k of ['buildings', 'log', 'gifts', 'trash'] as const) if (!Array.isArray(s[k])) (s as any)[k] = []
  for (const k of ['warehouse', 'inventory', 'cats', 'relationships', 'stats', 'achievements', 'seasonFirstSnow', 'seenEvents'] as const)
    if (typeof s[k] !== 'object' || !s[k]) (s as any)[k] = {}
  s.version = SAVE_VERSION
  return s
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadSave(): Promise<SaveData | null> {
  try {
    const db = await openDB()
    const data = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(KEY)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    db.close()
    if (!data) {
      // IndexedDB 不可用时的 localStorage 备份
      const ls = localStorage.getItem('stray-cat-yard-backup')
      return ls ? migrate(JSON.parse(ls)) : null
    }
    return migrate(data)
  } catch (e) {
    console.warn('load failed', e)
    const ls = localStorage.getItem('stray-cat-yard-backup')
    return ls ? migrate(JSON.parse(ls)) : null
  }
}

export async function writeSave(s: SaveData) {
  const plain = JSON.parse(JSON.stringify(s))
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(plain, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {
    console.warn('save failed, fallback to localStorage', e)
    try {
      localStorage.setItem('stray-cat-yard-backup', JSON.stringify(plain))
    } catch {
      /* ignore */
    }
  }
}

export async function clearSave() {
  try {
    const db = await openDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    /* ignore */
  }
  localStorage.removeItem('stray-cat-yard-backup')
}

export function exportSaveFile(s: SaveData) {
  const blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'cat-yard-save.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseSaveFile(text: string): SaveData {
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object' || !('gameMinutes' in raw) || !('buildings' in raw)) {
    throw new Error('不是有效的小院存档文件')
  }
  return migrate(raw)
}
