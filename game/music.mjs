import { ROOTS } from './engine.mjs';

const PITCH = semitones => 2 ** (semitones / 12);
const MAX_VOICES = 32, MAX_SOURCES = 128;
const PROFILES = {
  fork: { partials: [[1,.32],[3,.035],[5,.009]], duration: 1.8, attack: .014, pan: -.22, room: .16, cutoff: 6800 },
  chamber: { partials: [[1,.23],[2,.075],[3,.025],[4,.009]], duration: 2.1, attack: .045, pan: .30, room: .35, cutoff: 4300 },
  bell: { partials: [[1,.28],[2,.105],[2.756,.05],[4.07,.025],[5.43,.012]], duration: 2.4, attack: .006, pan: .08, room: .26, cutoff: 7400 },
  harp: { partials: [[1,.29],[2,.13],[3,.065],[4,.032],[5,.017],[6,.008]], duration: 1.8, attack: .004, pan: -.16, room: .20, cutoff: 6200 },
  drum: { partials: [[1,.39],[1.593,.07],[2.135,.025]], duration: .55, attack: .004, pan: 0, room: .07, cutoff: 2200 },
  choir: { duration: 2.6, attack: .18, pan: .12, room: .38, cutoff: 4800 }
};

function randomSource(seed) {
  return () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 2147483648 - 1; };
}

function makeRoom(ctx) {
  const duration=1.9, length=Math.floor(ctx.sampleRate*duration);
  const impulse=ctx.createBuffer(2,length,ctx.sampleRate);
  for(let ch=0;ch<2;ch++) {
    const data=impulse.getChannelData(ch), random=randomSource(71+ch*109);
    let warm=0;
    for(let i=0;i<length;i++) {
      const seconds=i/ctx.sampleRate;
      warm=.72*warm+.28*random();
      // A short pre-delay leaves the attack clear; the tail darkens as it fades.
      data[i]=warm*Math.min(1,Math.max(0,(seconds-.018)/.045))*Math.exp(-seconds*4.8);
    }
    for(const [delay,level] of [[.023,.42],[.041,.28],[.067,.19],[.097,.12]]) {
      data[Math.floor((delay+ch*.003)*ctx.sampleRate)]+=level;
    }
  }
  return impulse;
}

function makeCeiling() {
  const curve=new Float32Array(8193);
  for(let i=0;i<curve.length;i++) {
    const x=2*i/(curve.length-1)-1, a=Math.abs(x), t=(a-.75)/.25;
    curve[i]=a<=.75?x:Math.sign(x)*(.75+.25*(t-t*t*t/3));
  }
  return curve;
}

function envelope(param, start, duration, attack, peak) {
  param.setValueAtTime(0,start);
  param.linearRampToValueAtTime(peak,start+Math.min(attack,duration*.2));
  param.exponentialRampToValueAtTime(Math.max(.00002,peak*.25),start+duration*.38);
  param.exponentialRampToValueAtTime(.00001,start+duration*.96);
  param.linearRampToValueAtTime(0,start+duration);
}

export class Ensemble {
  constructor() {
    this.muted = false;
    this.volume = .7;
    this.error = '';
    this.voices = new Set();
    this.waves = new Map();
    this.lastKey = null;
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
      const mix=ctx.createGain(), highpass=ctx.createBiquadFilter();
      highpass.type='highpass';highpass.frequency.value=35;highpass.Q.value=.7;
      const compressor=ctx.createDynamicsCompressor();
      compressor.threshold.value=-16;compressor.knee.value=14;compressor.ratio.value=2.5;
      compressor.attack.value=.012;compressor.release.value=.28;
      const ceiling=ctx.createWaveShaper();
      ceiling.curve=makeCeiling();ceiling.oversample='2x';
      const master=ctx.createGain();
      master.gain.value=this.muted?0:this.volume;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      mix.connect(highpass).connect(compressor).connect(ceiling).connect(master).connect(analyser).connect(ctx.destination);

      const room = ctx.createConvolver();
      room.buffer=makeRoom(ctx);
      const damp=ctx.createBiquadFilter(), roomBass=ctx.createBiquadFilter(), wet=ctx.createGain();
      damp.type='lowpass';damp.frequency.value=4600;damp.Q.value=.5;
      roomBass.type='highpass';roomBass.frequency.value=180;roomBass.Q.value=.5;
      wet.gain.value=.62;
      room.connect(roomBass).connect(damp).connect(wet).connect(mix);
      const noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.5),ctx.sampleRate), random=randomSource(319);
      const samples=noise.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=random();

      this.voices.clear();this.waves.clear();this.lastKey=null;
      Object.assign(this, { ctx, mix, master, room, noise, analyser, samples: new Float32Array(analyser.fftSize) });
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

  retire(voice, now=this.ctx.currentTime) {
    if(voice.retiring)return;
    voice.retiring=true;
    voice.end=Math.min(voice.end,now+.045);
    voice.gate.gain.setTargetAtTime(0,now,.009);
    for(const source of voice.sources) {
      try { source.stop(now+.045); } catch { /* An ended source is already silent. */ }
    }
  }

  reserve(cost, priority, start) {
    const sounding=[...this.voices].filter(voice=>voice.end>start);
    // Allow a small overlap for fading stolen voices, with a hard resource bound.
    if(sounding.reduce((sum,voice)=>sum+voice.cost,0)+cost>MAX_SOURCES+32)return false;
    const active=sounding.filter(voice=>!voice.retiring), victims=[];
    let total=active.reduce((sum,voice)=>sum+voice.cost,0);
    active.sort((a,b)=>a.priority-b.priority||a.start-b.start);
    while(active.length>=MAX_VOICES || total+cost>MAX_SOURCES) {
      const victim=active.shift();
      if(!victim || victim.priority>priority)return false;
      victims.push(victim);total-=victim.cost;
    }
    for(const voice of victims)this.retire(voice,Math.max(this.ctx.currentTime,start-.015));
    return true;
  }

  choirWave(frequency) {
    const key=Math.round(frequency*100);
    if(this.waves.has(key))return this.waves.get(key);
    const real=new Float32Array(49),imag=new Float32Array(49);
    for(let n=1;n<imag.length && n*frequency<this.ctx.sampleRate*.45;n++) {
      const f=n*frequency;
      const vowel=Math.exp(-.5*((f-650)/180)**2)+.55*Math.exp(-.5*((f-1150)/230)**2)+.16*Math.exp(-.5*((f-2600)/400)**2);
      imag[n]=(.1+vowel)/n;
    }
    const wave=this.ctx.createPeriodicWave(real,imag);
    this.waves.set(key,wave);
    return wave;
  }

  note(frequency, timbre, level=1, options={}) {
    const p=PROFILES[timbre];
    if(!this.audible || !p || !Number.isFinite(frequency) || frequency<=0 || !Number.isFinite(level) || level<=0)return;
    const ctx=this.ctx, start=Math.max(ctx.currentTime,options.start??ctx.currentTime+.015);
    const priority=options.priority??1, variant=options.variant||0;
    const cost=timbre==='choir'?8:p.partials.length+(['harp','drum'].includes(timbre)?1:0);
    if(!this.reserve(cost,priority,start))return;
    const tone=ctx.createBiquadFilter(), gate=ctx.createGain(), send=ctx.createGain();
    tone.type='lowpass';tone.Q.value=.55;tone.frequency.setValueAtTime(p.cutoff,start);
    if(timbre==='harp')tone.frequency.exponentialRampToValueAtTime(1300,start+.42);
    const channel=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();
    if(channel.pan)channel.pan.value=Math.max(-.65,Math.min(.65,p.pan+(options.pan??Math.sin(variant*2.4)*.22)));
    tone.connect(gate).connect(channel).connect(this.mix);
    send.gain.value=p.room;channel.connect(send).connect(this.room);
    const voice={start,end:start+p.duration+.01,priority,cost,gate,sources:[],nodes:[tone,gate,channel,send],remaining:0,retiring:false};
    this.voices.add(voice);
    const source=(node,duration)=>{
      voice.sources.push(node);voice.remaining++;
      node.onended=()=>{
        node.disconnect();
        if(--voice.remaining===0){for(const part of voice.nodes)part.disconnect();this.voices.delete(voice);}
      };
      node.start(start);node.stop(start+duration+.01);
    };
    const partial=(pitch,volume,duration,detune=0,wave=null,vibrato=null)=>{
      if(pitch>=ctx.sampleRate*.45)return;
      const osc=ctx.createOscillator(), env=ctx.createGain();
      if(wave)osc.setPeriodicWave(wave);else osc.type='sine';
      osc.frequency.setValueAtTime(pitch,start);osc.detune.value=detune;
      if(vibrato)vibrato.connect(osc.detune);
      if(timbre==='drum')osc.frequency.exponentialRampToValueAtTime(pitch*.42,start+.12);
      envelope(env.gain,start,duration,p.attack,volume*level);
      osc.connect(env).connect(tone);voice.nodes.push(env);source(osc,duration);
    };
    if(timbre==='choir') {
      const vibrato=ctx.createOscillator(), depth=ctx.createGain();
      vibrato.frequency.value=4.8+(variant%3)*.21;
      depth.gain.setValueAtTime(0,start);depth.gain.linearRampToValueAtTime(6,start+.65);
      vibrato.connect(depth);voice.nodes.push(depth);source(vibrato,p.duration);
      const chord=[[0,3,7],[3,7,12],[7,12,15]][Math.abs(variant)%3];
      for(const semitones of chord) {
        const pitch=frequency*PITCH(semitones),wave=this.choirWave(pitch);
        for(const cents of [-4.5,4.5])partial(pitch,.08,p.duration,cents,wave,depth);
      }
    } else {
      for(const [ratio,volume] of p.partials) {
        partial(frequency*ratio,volume,p.duration/(1+.35*(ratio-1)),timbre==='fork'?0:(variant%5-2)*.6);
      }
    }
    if(['harp','drum','choir'].includes(timbre)) {
      const air=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), env=ctx.createGain();
      const duration=timbre==='choir'?p.duration:timbre==='drum'?.065:.035;
      air.buffer=this.noise;air.loop=true;
      filter.type='bandpass';filter.frequency.value=timbre==='drum'?1400:2400;filter.Q.value=.7;
      envelope(env.gain,start,duration,timbre==='choir'?.18:.002,(timbre==='drum'?.055:timbre==='harp'?.012:.007)*level);
      air.connect(filter).connect(env).connect(tone);voice.nodes.push(filter,env);source(air,duration);
    }
  }

  play(events, key, muted=false, when) {
    if(muted || !this.audible)return;
    const root=ROOTS[key]||ROOTS[0],start=Math.max(this.ctx.currentTime,when??this.ctx.currentTime+.015);
    if(this.lastKey!==null && this.lastKey!==key)for(const voice of this.voices)this.retire(voice,Math.max(this.ctx.currentTime,start-.015));
    this.lastKey=key;
    const notes=[];
    const add=(frequency,timbre,level=1,options={})=>notes.push({frequency,timbre,level,options:{start,...options}});
    let archive=0;
    for(const e of events) {
      const variant=e.slot||0, options={variant};
      if(e.type==='fork')add(root,'fork');
      if(e.type==='chamber')add(root*PITCH(7),'chamber');
      if(e.type==='bell')add(root*PITCH([12,19,24,15,22][Math.max(0,variant-1)%5]),'bell',1,options);
      if(e.type==='harp')add(root*PITCH([12,19,24,15,19][Math.max(0,variant-1)%5]),'harp',1,options);
      if(e.type==='drum')add(root*.85,'drum',.8,options);
      if(e.type==='choir')add(root,'choir',1,options);
      if(e.type==='phrase') {
        // Preserve each recorded rhythm, but voice it in the current movement's key.
        const options={priority:0,variant:archive,pan:(archive++-1)*.3};
        if(e.mask&1)add(root*.5,'fork',.26,options);
        if(e.mask&2)add(root*2,'bell',.20,options);
        if(e.mask&4)add(root*PITCH(7),'chamber',.21,options);
        if(e.mask&8)add(root*PITCH(7),'harp',.18,options);
        if(e.mask&16)add(root*.85,'drum',.16,options);
        if(e.mask&32)add(root*.5,'choir',.18,options);
      }
      if(e.type==='release' || e.type==='record') {
        add(root,'fork',.7,{priority:2});
        add(root*PITCH(3),'chamber',.72,{priority:2,start:start+.028});
        add(root*PITCH(7),'bell',.65,{priority:2,start:start+.056});
      }
    }
    const counts=new Map();
    const group=note=>(note.options.priority===0?'archive:':'live:')+note.timbre;
    for(const note of notes)counts.set(group(note),(counts.get(group(note))||0)+1);
    // Schedule foreground attacks first, and keep a large ensemble from overpowering the mix.
    notes.sort((a,b)=>(b.options.priority??1)-(a.options.priority??1));
    for(const note of notes)this.note(note.frequency,note.timbre,note.level/Math.sqrt(counts.get(group(note))),note.options);
  }
}
