'use client';

/**
 * Web Audio API Call Tone Generator
 * Generates authentic connecting "dot" caller tunes and ringing caller tunes
 * with zero external assets, zero latency, and cross-browser reliability.
 */
export class CallToneGenerator {
  private ctx: AudioContext | null = null;
  private intervalId: any = null;
  private activeOscs: OscillatorNode[] = [];
  private activeGains: GainNode[] = [];

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Plays the rhythmic "dot" caller tune while connecting the call.
   * Cadence: Crisp 880Hz electronic dot pulse every 600ms.
   */
  startConnectingTune() {
    this.stop();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const playDot = () => {
      try {
        if (!this.ctx || this.ctx.state === 'closed') return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // 880Hz crisp high-tech connecting tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);

        // Smooth quick dot envelope (0.12s)
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        this.activeOscs.push(osc);
        this.activeGains.push(gain);

        osc.onended = () => {
          this.activeOscs = this.activeOscs.filter((o) => o !== osc);
          this.activeGains = this.activeGains.filter((g) => g !== gain);
        };

        osc.start(now);
        osc.stop(now + 0.13);
      } catch {}
    };

    playDot();
    this.intervalId = setInterval(playDot, 650);
  }

  /**
   * Plays the classic telecom ringing caller tune while the remote line is ringing.
   * Cadence: Standard dual-frequency (440Hz + 480Hz) 1.6s burst followed by 2.4s pause.
   */
  startRingingTune() {
    this.stop();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const playRingCycle = () => {
      try {
        if (!this.ctx || this.ctx.state === 'closed') return;
        const now = this.ctx.currentTime;

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Standard telecom ringback frequencies
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now);

        // Smooth 1.6-second ring envelope
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.07, now + 0.08);
        gain.gain.setValueAtTime(0.07, now + 1.55);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        this.activeOscs.push(osc1, osc2);
        this.activeGains.push(gain);

        const cleanUp = () => {
          this.activeOscs = this.activeOscs.filter((o) => o !== osc1 && o !== osc2);
          this.activeGains = this.activeGains.filter((g) => g !== gain);
        };
        osc1.onended = cleanUp;

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.66);
        osc2.stop(now + 1.66);
      } catch {}
    };

    playRingCycle();
    this.intervalId = setInterval(playRingCycle, 4000);
  }

  /**
   * Plays the incoming call ringtone when someone calls the agent's web phone.
   * Cadence: Upbeat modern electronic ring (587Hz D5 + 880Hz A5) chime pattern.
   */
  startIncomingRingtone() {
    this.stop();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const playIncomingCycle = () => {
      try {
        if (!this.ctx || this.ctx.state === 'closed') return;
        const now = this.ctx.currentTime;

        const pulse = (timeOffset: number) => {
          if (!this.ctx) return;
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(587.33, now + timeOffset); // D5
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(880, now + timeOffset); // A5

          gain.gain.setValueAtTime(0.001, now + timeOffset);
          gain.gain.linearRampToValueAtTime(0.12, now + timeOffset + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + timeOffset + 0.42);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.ctx.destination);

          this.activeOscs.push(osc1, osc2);
          this.activeGains.push(gain);

          osc1.start(now + timeOffset);
          osc2.start(now + timeOffset);
          osc1.stop(now + timeOffset + 0.45);
          osc2.stop(now + timeOffset + 0.45);
        };

        pulse(0);
        pulse(0.35);
        pulse(0.7);
      } catch {}
    };

    playIncomingCycle();
    this.intervalId = setInterval(playIncomingCycle, 2800);
  }

  /**
   * Immediately stops all active tones and loops.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.activeGains.forEach((g) => {
      try {
        if (this.ctx) {
          g.gain.cancelScheduledValues(this.ctx.currentTime);
          g.gain.setValueAtTime(0, this.ctx.currentTime);
        }
      } catch {}
    });
    this.activeOscs.forEach((o) => {
      try { o.stop(); } catch {}
    });
    this.activeOscs = [];
    this.activeGains = [];
  }
}
