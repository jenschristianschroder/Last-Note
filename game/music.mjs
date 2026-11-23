import { ROOTS } from './engine.mjs';

export class Ensemble {
  constructor() {
    this.muted = false;
    this.volume = .7;
    this.error = '';
  }

  get state() {
    if (this.error) return 'error';
    return this.ctx?.state || 'locked';
  }

  get audible() {
    return this.state === 'running' && !this.muted && this.volume > 0;
  }

  initialize(Audio) {
    const ctx = new Audio();
    try {
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 5;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      master.connect(limiter);
      limiter.connect(analyser);
      analyser.connect(ctx.destination);

      const room = ctx.createConvolver();
      const length = Math.floor(ctx.sampleRate * 1.45);
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const samples = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
      }
      room.buffer = impulse;
      const wet = ctx.createGain();
      wet.gain.value = .18;
      room.connect(wet);
      wet.connect(master);

      Object.assign(this, { ctx, master, room, analyser, samples: new Float32Array(analyser.fftSize) });
      ctx.onstatechange = () => this.onstatechange?.();
    } catch (error) {
      void ctx.close().catch(() => {});
      throw error;
    }
  }

  async unlock(muted = false) {
    this.setMuted(muted);
    this.error = '';
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    let timer;
    try {
      if (!Audio) throw new Error('Web Audio is unavailable.');
      // Media playback routing allows music to use the device's media volume.
      try {
        if (globalThis.navigator?.audioSession) navigator.audioSession.type = 'playback';
      } catch { /* The audio session API is optional. */ }
      if (!this.ctx || this.ctx.state === 'closed') this.initialize(Audio);
      const ctx = this.ctx;
      if (ctx.state !== 'running') {
        // Invoke resume synchronously in the user's click, before any await.
        const resumed = ctx.resume();
        await Promise.race([
          resumed,
          new Promise(resolve => { timer = setTimeout(resolve, 2000); })
        ]);
      }
      return this.ctx === ctx && ctx.state === 'running';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Audio could not start.';
      return false;
    } finally {
      clearTimeout(timer);
      this.onstatechange?.();
    }
  }

  setMuted(muted) {
    this.muted = muted;
    this.applyVolume();
  }

  setVolume(volume) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyVolume();
  }

  applyVolume() {
    if (this.master && this.ctx.state !== 'closed') {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, .025);
    }
  }

  outputLevel() {
    if (!this.audible || !this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    const energy = this.samples.reduce((sum, value) => sum + value * value, 0);
    return Math.sqrt(energy / this.samples.length);
  }

  note(frequency, timbre, level = 1) {
    if (!this.audible) return;
    const ctx = this.ctx, start = ctx.currentTime + .012;
    const profiles = {
      fork: { partials: [[1, .38], [2, .14], [3, .06]], duration: 1.5, attack: .017, pan: -.30 },
      chamber: { partials: [[1, .24], [2, .10], [3, .05]], duration: 1.2, attack: .046, pan: .38 },
      harp: { partials: [[1, .30], [2, .12], [4, .04]], duration: 1.0, attack: .004, pan: -.12 },
      drum: { partials: [[1, .55], [1.5, .12]], duration: .55, attack: .006, pan: 0 },
      choir: { partials: [[1, .20], [1.2, .13], [1.5, .10]], duration: 2.4, attack: .14, pan: .15 },
      bell: { partials: [[1, .24], [2.01, .09], [3.03, .037], [4.19, .025]], duration: 1.55, attack: .006, pan: .08 }
    };
    const p = profiles[timbre];
    const channel = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (channel.pan) channel.pan.value = p.pan;
    channel.connect(this.master); channel.connect(this.room);
    let remaining = p.partials.length;
    for (const [ratio, volume] of p.partials) {
      const osc = ctx.createOscillator(), env = ctx.createGain();
      const stop = start + p.duration / Math.sqrt(ratio);
      osc.type = 'sine'; osc.frequency.value = frequency * ratio;
      if (timbre === 'drum') {
        osc.frequency.setValueAtTime(frequency * ratio, start);
        osc.frequency.exponentialRampToValueAtTime(frequency * ratio * .32, start + .14);
      }
      env.gain.setValueAtTime(.00001, start);
      env.gain.exponentialRampToValueAtTime(volume * level, start + p.attack);
      env.gain.exponentialRampToValueAtTime(volume * level * .22, start + (stop - start) * .35);
      env.gain.exponentialRampToValueAtTime(.00001, stop);
      osc.connect(env).connect(channel);
      osc.start(start); osc.stop(stop + .015);
      osc.onended = () => {
        osc.disconnect(); env.disconnect();
        if (--remaining === 0) channel.disconnect();
      };
    }
  }

  play(events, key, muted) {
    if (muted) return;
    const root = ROOTS[key];
    for (const e of events) {
      if (e.type === 'fork') this.note(root, 'fork');
      if (e.type === 'chamber') this.note(root * 1.5, 'chamber');
      if (e.type === 'bell') this.note(root * 3, 'bell');
      if (e.type === 'harp') this.note(root * 2, 'harp');
      if (e.type === 'drum') this.note(root, 'drum');
      if (e.type === 'choir') this.note(root, 'choir');
      if (e.type === 'phrase') {
        const f = ROOTS[e.key];
        if (e.mask & 1) this.note(f * .5, 'fork', .40);
        if (e.mask & 2) this.note(f * 2, 'bell', .22);
        if (e.mask & 4) this.note(f * 1.5, 'chamber', .27);
        if (e.mask & 8) this.note(f * 2, 'harp', .22);
        if (e.mask & 16) this.note(f, 'drum', .2);
        if (e.mask & 32) this.note(f, 'choir', .2);
      }
      if (e.type === 'release' || e.type === 'record') {
        this.note(root, 'fork', .55);
        this.note(root * 1.2, 'chamber', .62);
        this.note(root * 1.5, 'bell', .6);
      }
    }
  }
}
