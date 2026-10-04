import type { Game } from '../core/Game'
import { isRainy } from '../world/weather'

type Mood = 'day' | 'rain' | 'night' | 'snow'

/**
 * 全部声音由 Web Audio 实时合成：猫咪叫声、环境音、UI 音效与动态 BGM。
 */
class AudioEngine {
  ctx: AudioContext | null = null
  master!: GainNode
  bgmGain!: GainNode
  ambGain!: GainNode
  sfxGain!: GainNode
  private noiseBuf!: AudioBuffer
  private brownBuf!: AudioBuffer
  private rain?: { g: GainNode; f: BiquadFilterNode }
  private wind?: { g: GainNode; f: BiquadFilterNode }
  private cicada?: { g: GainNode }
  private purr?: { g: GainNode }
  private vol = { bgm: 0.5, ambient: 0.6, sfx: 0.7, bgmOn: true }
  private mood: Mood = 'day'
  private nextNote = 0
  private step = 0
  private chordIdx = 0
  private updT = 0
  private chirpT = 0
  private cricketT = 0
  private lastSfx: Record<string, number> = {}
  private delay?: { input: GainNode }

  /** 需要用户手势后调用 */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(ctx.destination)
    this.bgmGain = ctx.createGain()
    this.ambGain = ctx.createGain()
    this.sfxGain = ctx.createGain()
    this.bgmGain.connect(this.master)
    this.ambGain.connect(this.master)
    this.sfxGain.connect(this.master)
    // 噪声缓冲
    const len = ctx.sampleRate * 2
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    const b = this.brownBuf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      d[i] = Math.random() * 2 - 1
      last = (last + 0.02 * d[i]) / 1.02
      b[i] = last * 3.5
    }
    // BGM 混响（简单延迟）
    const dl = ctx.createDelay(1)
    dl.delayTime.value = 0.32
    const fb = ctx.createGain()
    fb.gain.value = 0.28
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2200
    const inp = ctx.createGain()
    inp.gain.value = 0.35
    inp.connect(dl)
    dl.connect(lp)
    lp.connect(fb)
    fb.connect(dl)
    lp.connect(this.bgmGain)
    this.delay = { input: inp }
    // 环境循环
    this.rain = this.loopNoise(this.noiseBuf, 'lowpass', 1500)
    this.wind = this.loopNoise(this.brownBuf, 'bandpass', 500)
    this.cicada = this.makeCicada()
    this.purr = this.makePurrLoop()
    this.applyVolumes()
    this.nextNote = ctx.currentTime + 0.5
  }

  setVolumes(v: { bgm: number; ambient: number; sfx: number; bgmOn: boolean }) {
    this.vol = { ...v }
    this.applyVolumes()
  }
  private applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.bgmGain.gain.setTargetAtTime(this.vol.bgmOn ? this.vol.bgm * 0.5 : 0, t, 0.3)
    this.ambGain.gain.setTargetAtTime(this.vol.ambient, t, 0.3)
    this.sfxGain.gain.setTargetAtTime(this.vol.sfx, t, 0.05)
  }

  private loopNoise(buf: AudioBuffer, type: BiquadFilterType, freq: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f)
    f.connect(g)
    g.connect(this.ambGain)
    src.start()
    return { g, f }
  }

  private makeCicada() {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 5200
    f.Q.value = 6
    const am = ctx.createGain()
    am.gain.value = 0.5
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 38
    const lg = ctx.createGain()
    lg.gain.value = 0.5
    lfo.connect(lg)
    lg.connect(am.gain)
    lfo.start()
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f)
    f.connect(am)
    am.connect(g)
    g.connect(this.ambGain)
    src.start()
    return { g }
  }

  private makePurrLoop() {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.brownBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 180
    const am = ctx.createGain()
    am.gain.value = 0.5
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 24
    const lg = ctx.createGain()
    lg.gain.value = 0.5
    lfo.connect(lg)
    lg.connect(am.gain)
    lfo.start()
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f)
    f.connect(am)
    am.connect(g)
    g.connect(this.ambGain)
    src.start()
    return { g }
  }

  // ================= 工具 =================

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, out: AudioNode, attack = 0.01) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    const g = ctx.createGain()
    this.env(g, t, attack, vol, dur)
    o.connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + attack + dur + 0.05)
    return o
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, vol: number, out: AudioNode, q = 1, brown = false) {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = brown ? this.brownBuf : this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    this.env(g, t, 0.01, vol, dur)
    s.connect(f)
    f.connect(g)
    g.connect(out)
    s.start(t, Math.random())
    s.stop(t + dur + 0.1)
    return f
  }

  // ================= 音效 =================

  sfx(name: string, opts: { pitch?: number; soft?: boolean } = {}) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    // 同类音效节流
    if (this.lastSfx[name] && now - this.lastSfx[name] < 0.08) return
    this.lastSfx[name] = now
    const out = this.sfxGain
    const p = opts.pitch ?? 1
    switch (name) {
      case 'meow': {
        const v = opts.soft ? 0.05 : 0.09
        const dur = 0.35 + Math.random() * 0.25
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        const base = 480 * p * (0.9 + Math.random() * 0.2)
        o.frequency.setValueAtTime(base, now)
        o.frequency.linearRampToValueAtTime(base * 1.55, now + dur * 0.35)
        o.frequency.linearRampToValueAtTime(base * 0.85, now + dur)
        const f1 = ctx.createBiquadFilter()
        f1.type = 'bandpass'
        f1.frequency.setValueAtTime(900, now)
        f1.frequency.linearRampToValueAtTime(1500, now + dur * 0.4)
        f1.frequency.linearRampToValueAtTime(700, now + dur)
        f1.Q.value = 4
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(v, now + 0.05)
        g.gain.setValueAtTime(v, now + dur * 0.6)
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        o.connect(f1)
        f1.connect(g)
        g.connect(out)
        o.start(now)
        o.stop(now + dur + 0.05)
        break
      }
      case 'purr': {
        const s = ctx.createBufferSource()
        s.buffer = this.brownBuf
        const f = ctx.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.value = 220
        const am = ctx.createGain()
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 25
        const lg = ctx.createGain()
        lg.gain.value = 0.5
        am.gain.value = 0.5
        lfo.connect(lg)
        lg.connect(am.gain)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(0.5, now + 0.3)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2)
        s.connect(f)
        f.connect(am)
        am.connect(g)
        g.connect(out)
        s.start(now, Math.random())
        lfo.start(now)
        s.stop(now + 2.1)
        lfo.stop(now + 2.1)
        break
      }
      case 'hiss':
        this.noise(now, 0.6, 'highpass', 2500, 0.12, out)
        break
      case 'fight':
        for (let i = 0; i < 8; i++) this.noise(now + i * 0.25, 0.15, 'bandpass', 1200 + Math.random() * 1500, 0.12, out, 2)
        this.sfx('hiss')
        break
      case 'eat':
        for (let i = 0; i < 4; i++) this.noise(now + i * 0.13 + Math.random() * 0.04, 0.04, 'bandpass', 1800, 0.08, out, 3)
        break
      case 'drink':
        for (let i = 0; i < 5; i++) this.tone(700 + Math.random() * 300, now + i * 0.12, 0.05, 'sine', 0.05, out)
        break
      case 'scratch':
        for (let i = 0; i < 6; i++) this.noise(now + i * 0.11, 0.07, 'bandpass', 3200, 0.06, out, 1.5)
        break
      case 'thunder': {
        this.noise(now, 3.5, 'lowpass', 160, 0.9, out, 0.7, true)
        this.noise(now + 0.05, 0.6, 'lowpass', 900, 0.25, out)
        break
      }
      case 'click':
        this.tone(880, now, 0.05, 'triangle', 0.08, out)
        break
      case 'place': {
        const o = this.tone(200, now, 0.18, 'sine', 0.25, out)
        o.frequency.exponentialRampToValueAtTime(70, now + 0.15)
        this.noise(now, 0.06, 'bandpass', 600, 0.08, out)
        break
      }
      case 'gift':
        ;[784, 988, 1175, 1568].forEach((f, i) => this.tone(f, now + i * 0.07, 0.25, 'triangle', 0.07, out))
        break
      case 'unlock':
        ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.1, 0.4, 'triangle', 0.08, out))
        break
      case 'achievement':
        ;[523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.09, 0.35, 'square', 0.035, out))
        break
      case 'craft':
        this.noise(now, 0.05, 'bandpass', 900, 0.2, out, 2)
        this.noise(now + 0.16, 0.05, 'bandpass', 1100, 0.2, out, 2)
        this.tone(660, now + 0.3, 0.3, 'triangle', 0.06, out)
        break
      case 'pour': {
        const f = this.noise(now, 0.6, 'bandpass', 2500, 0.1, out, 2)
        f.frequency.linearRampToValueAtTime(1200, now + 0.6)
        for (let i = 0; i < 6; i++) this.noise(now + 0.05 + i * 0.08, 0.03, 'bandpass', 2000, 0.06, out, 4)
        break
      }
      case 'water':
      case 'splash':
        for (let i = 0; i < 6; i++) {
          const o = this.tone(400 + Math.random() * 500, now + i * 0.06, 0.08, 'sine', 0.06, out)
          o.frequency.exponentialRampToValueAtTime(1200, now + i * 0.06 + 0.08)
        }
        if (name === 'splash') this.noise(now, 0.3, 'highpass', 1500, 0.08, out)
        break
      case 'clean': {
        const f = this.noise(now, 0.4, 'bandpass', 800, 0.1, out, 1)
        f.frequency.linearRampToValueAtTime(3000, now + 0.4)
        break
      }
      case 'chatter':
        for (let i = 0; i < 7; i++) this.tone(900 + Math.random() * 200, now + i * 0.07, 0.03, 'square', 0.025, out)
        break
      case 'sneeze':
        this.noise(now, 0.12, 'bandpass', 2000, 0.12, out, 1)
        this.tone(900 * p, now, 0.08, 'triangle', 0.04, out)
        break
      case 'birds':
        for (let i = 0; i < 4; i++) this.chirp(now + i * 0.3)
        break
      case 'cicada':
        this.noise(now, 2.5, 'bandpass', 5200, 0.05, out, 6)
        break
    }
  }

  private chirp(t: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    const f0 = 2600 + Math.random() * 1600
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.4 : 0.7), t + 0.08)
    const g = ctx.createGain()
    this.env(g, t, 0.005, 0.025, 0.09)
    o.connect(g)
    g.connect(this.ambGain)
    o.start(t)
    o.stop(t + 0.15)
  }

  private cricket(t: number) {
    for (let i = 0; i < 3; i++) this.tone(4200, t + i * 0.05, 0.025, 'sine', 0.012, this.ambGain, 0.003)
  }

  // ================= 每帧更新 =================

  update(g: Game) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    // BGM 调度
    if (this.vol.bgmOn) this.scheduleMusic(now)
    this.updT -= 1 / 60
    if (this.updT > 0) return
    this.updT = 0.5
    const w = g.weather
    const ck = g.clock
    const rainV = w === 'lightRain' ? 0.18 : w === 'heavyRain' ? 0.35 : w === 'storm' ? 0.45 : 0
    this.rain!.g.gain.setTargetAtTime(rainV, now, 1.5)
    this.rain!.f.frequency.setTargetAtTime(w === 'lightRain' ? 1400 : 3200, now, 1)
    const windV = w === 'windy' ? 0.5 : w === 'storm' ? 0.3 : w === 'snow' ? 0.08 : 0.03
    this.wind!.g.gain.setTargetAtTime(windV, now, 2)
    this.wind!.f.frequency.setTargetAtTime(350 + Math.sin(now * 0.3) * 200, now, 1)
    const cic = ck.season === 'summer' && !ck.isNight && !isRainy(w) ? 0.05 : 0
    this.cicada!.g.gain.setTargetAtTime(cic, now, 3)
    const sleepers = g.cats.filter((c) => (c.state === 'SLEEP' || c.state === 'SUNBATHE') && !c.moving).length
    this.purr!.g.gain.setTargetAtTime(Math.min(0.25, sleepers * 0.06), now, 2)
    // 鸟叫 / 虫鸣
    this.chirpT -= 0.5
    if (this.chirpT <= 0 && !ck.isNight && !isRainy(w) && w !== 'snow') {
      this.chirpT = 3 + Math.random() * 8
      const n = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) this.chirp(now + i * 0.18)
    }
    this.cricketT -= 0.5
    if (this.cricketT <= 0 && ck.isNight && (ck.season === 'summer' || ck.season === 'autumn') && !isRainy(w)) {
      this.cricketT = 0.6 + Math.random() * 1.5
      this.cricket(now)
    }
    // 音乐情绪
    this.mood = w === 'snow' ? 'snow' : isRainy(w) ? 'rain' : ck.isNight ? 'night' : 'day'
  }

  // ================= 动态 BGM =================

  private static CHORDS: Record<Mood, number[][]> = {
    // 以 MIDI 音高表示
    day: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], // Cmaj7 Am7 Fmaj7 G7
    night: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 55, 59, 62]], // Am7 Fmaj7 Dm7 Em7
    rain: [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]],
    snow: [[65, 69, 72, 76], [62, 65, 69, 72], [58, 62, 65, 69], [60, 64, 67, 70]],
  }

  private scheduleMusic(now: number) {
    const tempo = this.mood === 'day' ? 84 : this.mood === 'night' ? 70 : this.mood === 'rain' ? 62 : 76
    const spb = 60 / tempo / 2 // 八分音符
    while (this.nextNote < now + 0.4) {
      if (this.nextNote < now - 0.2) this.nextNote = now
      this.playStep(this.nextNote, spb)
      this.nextNote += spb * (this.mood === 'night' ? (this.step % 2 ? 0.85 : 1.15) : 1) // 夜晚摇摆
      this.step++
      if (this.step % 16 === 0) this.chordIdx = (this.chordIdx + 1) % 4
    }
  }

  private midi(n: number) {
    return 440 * Math.pow(2, (n - 69) / 12)
  }

  private playStep(t: number, spb: number) {
    const chord = AudioEngine.CHORDS[this.mood][this.chordIdx]
    const s = this.step % 16
    const out = this.bgmGain
    const wet = this.delay!.input
    switch (this.mood) {
      case 'day': {
        // 木吉他分解和弦
        const pattern = [0, 2, 1, 3, 2, 1, 3, 2]
        const n = chord[pattern[s % 8]] + (s % 8 === 0 ? 0 : 12)
        if (s % 8 === 0) this.pluck(this.midi(chord[0] - 12), t, 1.2, 0.06, out)
        if (Math.random() < 0.85) this.pluck(this.midi(n), t, 0.6, 0.035, out, wet)
        break
      }
      case 'night': {
        // Lo-Fi 电钢琴
        if (s === 0 || s === 10) chord.forEach((n) => this.epiano(this.midi(n), t, spb * 6, 0.018, out, wet))
        if (s % 4 === 0) this.tone(this.midi(chord[0] - 24), t, spb * 3, 'sine', 0.05, out, 0.02)
        if (s % 4 === 2 && Math.random() < 0.6) this.noise(t, 0.04, 'highpass', 7000, 0.015, out)
        if (Math.random() < 0.18) this.epiano(this.midi(chord[Math.floor(Math.random() * 4)] + 12), t, spb * 2, 0.02, out, wet)
        break
      }
      case 'rain': {
        // 钢琴：稀疏的旋律
        if (s === 0) chord.slice(0, 3).forEach((n) => this.piano(this.midi(n - 12), t, 2.5, 0.025, out, wet))
        if (s % 2 === 0 && Math.random() < 0.45) this.piano(this.midi(chord[Math.floor(Math.random() * 4)] + 12), t, 1.5, 0.03, out, wet)
        break
      }
      case 'snow': {
        // 八音盒
        if (Math.random() < 0.7) this.musicBox(this.midi(chord[(s * 3) % 4] + (s % 4 === 0 ? 0 : 12)), t, out, wet)
        break
      }
    }
  }

  private pluck(f: number, t: number, dur: number, vol: number, out: AudioNode, wet?: AudioNode) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'sawtooth'
    o2.frequency.value = f * 1.002
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(f * 6, t)
    lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.3)
    const g = ctx.createGain()
    this.env(g, t, 0.004, vol, dur)
    const g2 = ctx.createGain()
    g2.gain.value = 0.25
    o.connect(lp)
    o2.connect(g2)
    g2.connect(lp)
    lp.connect(g)
    g.connect(out)
    if (wet) g.connect(wet)
    o.start(t)
    o2.start(t)
    o.stop(t + dur + 0.1)
    o2.stop(t + dur + 0.1)
  }

  private epiano(f: number, t: number, dur: number, vol: number, out: AudioNode, wet?: AudioNode) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const m = ctx.createOscillator()
    m.frequency.value = f * 2
    const mg = ctx.createGain()
    mg.gain.value = f * 0.3
    m.connect(mg)
    mg.connect(o.frequency)
    const g = ctx.createGain()
    this.env(g, t, 0.01, vol, dur)
    o.connect(g)
    g.connect(out)
    if (wet) g.connect(wet)
    o.start(t)
    m.start(t)
    o.stop(t + dur + 0.1)
    m.stop(t + dur + 0.1)
  }

  private piano(f: number, t: number, dur: number, vol: number, out: AudioNode, wet?: AudioNode) {
    this.tone(f, t, dur, 'sine', vol, out, 0.005)
    this.tone(f * 2, t, dur * 0.5, 'sine', vol * 0.35, out, 0.005)
    if (wet) this.tone(f, t, dur, 'triangle', vol * 0.5, wet, 0.005)
  }

  private musicBox(f: number, t: number, out: AudioNode, wet: AudioNode) {
    this.tone(f, t, 0.9, 'sine', 0.03, out, 0.002)
    this.tone(f * 3.01, t, 0.25, 'sine', 0.01, out, 0.002)
    this.tone(f, t, 0.9, 'sine', 0.02, wet, 0.002)
  }
}

export const audio = new AudioEngine()
