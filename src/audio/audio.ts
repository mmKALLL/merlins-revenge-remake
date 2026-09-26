// Web Audio playback for the sim's `sound` and `music` events (docs/plans/2026-09-27-sound-design.md).
// The sim decides what is heard; this decides how: a 7-voice effects pool that drops new sounds
// when full (soundMaster.playSound), one looping music bus (soundMaster.playMusic, looping is a
// remake choice), and the player's music/effects toggles and master volume, kept in localStorage.
import { loadAudioIndex, musicUrl, soundUrl, type AudioIndex } from '../data/loaders'
import { DEFAULT_VOLUME, hasFreeVoice, MAX_VOLUME } from '../mr-open/mr-sound'
import type { SimEvent } from '../sim/state'

export interface AudioSettings {
  music: boolean
  effects: boolean
  volume: number // master, 0-100
}

const SETTINGS_KEY = 'mr-remake.audio'
/** Music change on entering a room: fade the old track out, pause, then start the new one (user request). */
const MUSIC_FADE_S = 1
const MUSIC_GAP_S = 0.5

const DEFAULT_SETTINGS: AudioSettings = { music: true, effects: true, volume: 70 }

export function loadAudioSettings(): AudioSettings {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>
      return {
        music: typeof o['music'] === 'boolean' ? o['music'] : DEFAULT_SETTINGS.music,
        effects: typeof o['effects'] === 'boolean' ? o['effects'] : DEFAULT_SETTINGS.effects,
        volume: typeof o['volume'] === 'number' ? Math.max(0, Math.min(100, o['volume'])) : DEFAULT_SETTINGS.volume,
      }
    }
  } catch {
    // storage blocked or corrupt: defaults
  }
  return { ...DEFAULT_SETTINGS }
}

function saveAudioSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // storage blocked: the settings last for this page only
  }
}

export class AudioEngine {
  private readonly ctx: AudioContext | null
  private readonly master: GainNode | null = null
  private readonly effectsBus: GainNode | null = null
  private readonly musicBus: GainNode | null = null
  private index: AudioIndex | null = null
  private readonly effects = new Map<string, AudioBuffer>()
  private readonly voices = new Set<AudioBufferSourceNode>()
  private readonly musicBuffers = new Map<string, Promise<AudioBuffer | null>>()
  private readonly warned = new Set<string>()
  private settings: AudioSettings
  /** the track the current room asked for (null: musicOff or none yet); resumed when music is turned back on */
  private wanted: string | null = null
  private playing: { track: string; source: AudioBufferSourceNode; gain: GainNode } | null = null
  private readonly fading = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>() // old tracks fading out
  private pending: string | null = null // track being fetched/decoded
  private musicToken = 0

  constructor(settings: AudioSettings = loadAudioSettings()) {
    this.settings = settings
    let ctx: AudioContext | null = null
    try {
      ctx = new AudioContext()
    } catch (e) {
      console.warn('Web Audio unavailable, playing silently:', e)
    }
    this.ctx = ctx
    if (!ctx) return
    this.master = ctx.createGain()
    this.master.connect(ctx.destination)
    this.effectsBus = ctx.createGain()
    this.effectsBus.connect(this.master)
    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = DEFAULT_VOLUME / MAX_VOLUME // playMusic's default volume
    this.musicBus.connect(this.master)
    this.applyVolume()
  }

  get current(): AudioSettings {
    return { ...this.settings }
  }

  /** Loads the index and decodes every effect; music is decoded on first use. */
  async preload(): Promise<void> {
    if (!this.ctx) return
    try {
      this.index = await loadAudioIndex()
    } catch (e) {
      console.warn('audio index unavailable, playing silently:', e)
      return
    }
    this.syncMusic() // a track requested before the index arrived
    await Promise.all(this.index.sounds.map(async (name) => {
      const buf = await this.decode(soundUrl(name))
      if (buf) this.effects.set(name, buf)
    }))
  }

  /** Browsers start the context suspended; resume it on the first key or pointer press (capture phase, so isolated controls count too). */
  attachUnlock(target: Window): void {
    const ctx = this.ctx
    if (!ctx) return
    const unlock = () => {
      if (ctx.state === 'running') {
        for (const type of ['keydown', 'pointerdown'] as const) target.removeEventListener(type, unlock, true)
        return
      }
      void ctx.resume()
    }
    for (const type of ['keydown', 'pointerdown'] as const) target.addEventListener(type, unlock, true)
  }

  /** Forwards one tick's sim events. */
  handle(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind === 'sound') this.playSound(e.name, e.volume)
      else if (e.kind === 'music') this.playMusic(e.track)
    }
  }

  playSound(name: string, volume: number): void {
    const ctx = this.ctx
    // effects heard only while running: sounds queued on a suspended context would all burst out on resume
    if (!ctx || !this.effectsBus || !this.settings.effects || ctx.state !== 'running') return
    const buf = this.effects.get(name)
    if (!buf) {
      if (this.index && !this.index.sounds.includes(name)) this.warnOnce(`sound "${name}" has no file`)
      return
    }
    if (!hasFreeVoice(this.voices.size)) return // all 7 channels busy: dropped, as the engine does
    const gain = ctx.createGain()
    gain.gain.value = Math.max(0, Math.min(MAX_VOLUME, volume)) / MAX_VOLUME
    gain.connect(this.effectsBus)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(gain)
    src.onended = () => {
      this.voices.delete(src)
      gain.disconnect()
    }
    this.voices.add(src)
    src.start()
  }

  /**
   * A room's music request: the same track keeps playing; another replaces it after the old one fades
   * out (MUSIC_FADE_S) and a short silence (MUSIC_GAP_S); null fades the music out.
   */
  playMusic(track: string | null): void {
    this.wanted = track
    this.syncMusic()
  }

  setMusic(on: boolean): void {
    this.update({ music: on })
    this.syncMusic() // off stops the bus; on resumes the current room's track from the start
  }

  setEffects(on: boolean): void {
    this.update({ effects: on })
    if (!on) this.stopEffects()
  }

  setVolume(volume: number): void {
    this.update({ volume: Math.max(0, Math.min(100, volume)) })
    this.applyVolume()
  }

  private update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch }
    saveAudioSettings(this.settings)
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.settings.volume / 100
  }

  private stopEffects(): void {
    for (const src of this.voices) {
      try {
        src.stop()
      } catch {
        // already stopped
      }
    }
    this.voices.clear()
  }

  private syncMusic(): void {
    const ctx = this.ctx
    if (!ctx || !this.musicBus) return
    const desired = this.settings.music ? this.wanted : null
    if (desired !== null && this.pending === desired) return
    if (this.playing !== null && this.playing.track === desired) {
      this.cancelPending() // back to the playing track before another finished loading: keep it
      return
    }
    // A room change fades the old track out, then a short silence, then the new one (remake choice;
    // the engine cuts over at once). Turning music off in the controls stops it at once.
    const fade = this.settings.music && this.playing !== null
    let startAt = ctx.currentTime
    if (fade) {
      this.fadeOutMusic()
      startAt += MUSIC_FADE_S + MUSIC_GAP_S
    } else {
      this.stopMusic()
    }
    this.cancelPending()
    if (desired === null) return
    if (this.index && !this.index.music.includes(desired)) {
      this.warnOnce(`music "${desired}" has no file`)
      return
    }
    const token = ++this.musicToken
    this.pending = desired
    void this.musicBuffer(desired).then((buf) => {
      if (token !== this.musicToken) return // superseded while loading
      this.pending = null
      if (!buf || !this.musicBus) return
      const gain = ctx.createGain()
      gain.connect(this.musicBus)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true // remake choice: the original plays each track once
      src.connect(gain)
      src.start(Math.max(ctx.currentTime, startAt))
      this.playing = { track: desired, source: src, gain }
    })
  }

  private cancelPending(): void {
    this.musicToken++
    this.pending = null
  }

  /** Ramps the playing track to silence over MUSIC_FADE_S, then stops it. */
  private fadeOutMusic(): void {
    const ctx = this.ctx
    const old = this.playing
    if (!ctx || !old) return
    this.playing = null
    const now = ctx.currentTime
    old.gain.gain.cancelScheduledValues(now)
    old.gain.gain.setValueAtTime(old.gain.gain.value, now)
    old.gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE_S)
    const entry = { source: old.source, gain: old.gain }
    this.fading.add(entry)
    old.source.onended = () => {
      this.fading.delete(entry)
      old.gain.disconnect()
    }
    try {
      old.source.stop(now + MUSIC_FADE_S)
    } catch {
      // already stopped
    }
  }

  /** Stops the playing track and any fading ones at once. */
  private stopMusic(): void {
    this.cancelPending()
    const all = [...this.fading, ...(this.playing ? [this.playing] : [])]
    this.fading.clear()
    this.playing = null
    for (const m of all) {
      try {
        m.source.stop()
      } catch {
        // already stopped
      }
      m.source.disconnect()
      m.gain.disconnect()
    }
  }

  private musicBuffer(track: string): Promise<AudioBuffer | null> {
    let p = this.musicBuffers.get(track)
    if (!p) {
      p = this.decode(musicUrl(track))
      this.musicBuffers.set(track, p)
    }
    return p
  }

  private async decode(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await this.ctx.decodeAudioData(await res.arrayBuffer())
    } catch (e) {
      this.warnOnce(`failed to load ${url}: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  private warnOnce(msg: string): void {
    if (this.warned.has(msg)) return
    this.warned.add(msg)
    console.warn(`audio: ${msg}`)
  }
}
