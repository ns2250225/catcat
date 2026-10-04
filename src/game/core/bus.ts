type Handler = (...args: any[]) => void

/** 极简事件总线：引擎 → UI 通知 */
export class Bus {
  private map = new Map<string, Set<Handler>>()
  on(ev: string, fn: Handler) {
    if (!this.map.has(ev)) this.map.set(ev, new Set())
    this.map.get(ev)!.add(fn)
    return () => this.map.get(ev)?.delete(fn)
  }
  emit(ev: string, ...args: any[]) {
    this.map.get(ev)?.forEach((fn) => fn(...args))
  }
}
