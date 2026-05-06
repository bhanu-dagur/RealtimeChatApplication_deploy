import { Injectable } from '@angular/core';

// Plays a soft 2-tone "ping" via the Web Audio API. Using oscillators (not an
// audio file) means there's nothing to bundle or fetch — the sound is
// synthesised on the fly. Throttled so a burst of incoming messages doesn't
// machine-gun the speakers.
@Injectable({ providedIn: 'root' })
export class NotificationSoundService {
  private ctx?: AudioContext;
  private lastPlayed = 0;
  private readonly THROTTLE_MS = 800;
  private muted = false;

  setMuted(muted: boolean): void { this.muted = muted; }
  isMuted(): boolean { return this.muted; }

  /**
   * Play a short message-arrival chime. Returns silently if:
   *   - the service is muted
   *   - we played recently (debounce)
   *   - the browser hasn't given us an unsuspended AudioContext yet (no user
   *     gesture has occurred). The first call after a click will lazily
   *     resume the context.
   */
  ping(): void {
    if (this.muted) return;
    const now = Date.now();
    if (now - this.lastPlayed < this.THROTTLE_MS) return;
    this.lastPlayed = now;

    try {
      if (!this.ctx) {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx!.state === 'suspended') this.ctx!.resume().catch(() => { });

      // Two short notes — Mi (E5) → Sol (G5). 0.10s each, exponential decay.
      this.tone(659.25, 0.0, 0.10);
      this.tone(783.99, 0.10, 0.14);
    } catch { /* AudioContext can throw on some Safari versions — non-fatal */ }
  }

  private tone(freq: number, delaySec: number, durationSec: number): void {
    if (!this.ctx) return;
    const start = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Soft envelope so it sounds like a "ping" rather than a beep cut-off.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }
}
