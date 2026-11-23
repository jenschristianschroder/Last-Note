import { ROOTS } from './engine.mjs';

export class Ensemble {
  async unlock(muted) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    try {
      if (!this.ctx) {
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = muted ? 0 : .46;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 5;
        this.master.connect(limiter).connect(this.ctx.destination);
        this.room = this.ctx.createConvolver();
        const length = Math.floor(this.ctx.sampleRate * 1.45);
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const samples = impulse.getChannelData(ch);
          for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
        }
        this.room.buffer = impulse;
        const wet = this.ctx.createGain();
        wet.gain.value = .18;
        this.room.connect(wet).connect(this.master);
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      this.setMuted(muted);
      return this.ctx.state === 'running';
    } catch { return false; }
  }

  setMuted(muted) {
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : .46, this.ctx.currentTime, .025);
  }

  note(frequency, timbre, level = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, start = ctx.currentTime + .012;
    const profiles = {
      fork: { partials: [[1, .38], [2, .065], [3, .027]], duration: 1.5, attack: .017, pan: -.30 },
      chamber: { partials: [[1, .21], [2, .057], [3, .042]], duration: 1.2, attack: .046, pan: .38 },
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
      env.gain.setValueAtTime(.00001, start);
      env.gain.exponentialRampToValueAtTime(volume * level, start + p.attack);
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
      if (e.type === 'phrase') {
        const f = ROOTS[e.key];
        if (e.mask & 1) this.note(f * .5, 'fork', .40);
        if (e.mask & 2) this.note(f * 2, 'bell', .22);
        if (e.mask & 4) this.note(f * 1.5, 'chamber', .27);
      }
      if (e.type === 'release' || e.type === 'record') {
        this.note(root, 'fork', .55);
        this.note(root * 1.2, 'chamber', .62);
        this.note(root * 1.5, 'bell', .6);
      }
    }
  }
}
