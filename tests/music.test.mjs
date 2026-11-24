import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Ensemble } from '../game/music.mjs';
import { ROOTS } from '../game/engine.mjs';

const originalContext = globalThis.AudioContext;
afterEach(() => {
  if (originalContext) globalThis.AudioContext = originalContext;
  else delete globalThis.AudioContext;
});

function useContext(t, music, Context) {
  globalThis.AudioContext = Context;
  t.mock.method(music, 'initialize', Audio => {
    music.ctx = new Audio();
  });
}

test('audio begins locked and requests resume inside the activation call', async t => {
  const music = new Ensemble();
  assert.equal(music.state, 'locked');
  assert.equal(music.audible, false);
  let finishResume;
  let resumes = 0;
  useContext(t, music, class {
    state = 'suspended';
    resume() {
      resumes++;
      return new Promise(resolve => {
        finishResume = () => { this.state = 'running'; resolve(); };
      });
    }
  });
  const ready = music.unlock();
  assert.equal(resumes, 1);
  assert.equal(music.audible, false);
  finishResume();
  assert.equal(await ready, true);
  assert.equal(music.audible, true);
});

test('a delayed resume preserves a mute applied during activation', async t => {
  const music = new Ensemble();
  let finishResume;
  useContext(t, music, class {
    state = 'suspended';
    resume() {
      return new Promise(resolve => {
        finishResume = () => { this.state = 'running'; resolve(); };
      });
    }
  });
  const ready = music.unlock();
  music.setMuted(true);
  finishResume();
  assert.equal(await ready, true);
  assert.equal(music.audible, false);
  assert.equal(music.muted, true);
});

test('an interrupted context resumes and a closed context is recreated', async t => {
  const music = new Ensemble();
  let created = 0;
  useContext(t, music, class {
    constructor() { this.state = 'suspended'; created++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
  });
  await music.unlock();
  const first = music.ctx;
  first.state = 'interrupted';
  assert.equal(music.audible, false);
  assert.equal(await music.unlock(), true);
  assert.equal(music.ctx, first);
  first.state = 'closed';
  assert.equal(await music.unlock(), true);
  assert.notEqual(music.ctx, first);
  assert.equal(created, 2);
});

test('blocked activation finishes with a retryable status instead of claiming sound is on', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const music = new Ensemble();
  useContext(t, music, class {
    state = 'suspended';
    resume() { return new Promise(() => {}); }
  });
  const ready = music.unlock();
  t.mock.timers.tick(2000);
  assert.equal(await ready, false);
  assert.equal(music.state, 'suspended');
  assert.equal(music.audible, false);
});

test('a failed audio graph is discarded so a later activation can retry', async t => {
  const music = new Ensemble();
  let closed = false;
  class BrokenContext {
    createGain() { throw new Error('Audio device unavailable'); }
    close() { closed = true; return Promise.resolve(); }
  }
  globalThis.AudioContext = BrokenContext;
  assert.equal(await music.unlock(), false);
  assert.equal(closed, true);
  assert.equal(music.ctx, undefined);
  assert.equal(music.state, 'error');
  t.mock.method(music, 'initialize', () => { music.ctx = { state: 'running' }; });
  assert.equal(await music.unlock(), true);
  assert.equal(music.state, 'running');
});

test('muting or setting volume to zero suppresses new voices', () => {
  const music = new Ensemble();
  music.ctx = { state: 'running', createOscillator() { assert.fail('Muted voice created'); } };
  music.setMuted(true);
  music.play([{type:'bell'}],0,false);
  music.setMuted(false);
  music.setVolume(0);
  music.play([{type:'fork'}],0,false);
  assert.equal(music.outputLevel(),0);
});

test('recorded rhythms harmonize with the current key and share the foreground beat time', t => {
  const music=new Ensemble(), notes=[];
  music.ctx={state:'running',currentTime:10};
  t.mock.method(music,'note',(...args)=>notes.push(args));
  music.play([{type:'fork'},{type:'phrase',key:0,mask:63}],4,false);
  const archived=notes.filter(note=>note[3].priority===0);
  assert.equal(archived.length,6);
  assert.equal(archived.find(note=>note[1]==='fork')[0],ROOTS[4]*.5);
  assert.equal(archived.find(note=>note[1]==='bell')[0],ROOTS[4]*2);
  assert.ok(notes.every(note=>note[3].start===10.015));
  const first=notes.map(note=>note[0]);
  notes.length=0;
  music.play([{type:'fork'},{type:'phrase',key:3,mask:63}],4,false);
  assert.deepEqual(notes.map(note=>note[0]),first,'The recording key must not introduce a clashing chord');
});

test('large choirs keep their total level controlled while retaining individual voicings', t => {
  const music=new Ensemble(), notes=[];
  music.ctx={state:'running',currentTime:0};
  t.mock.method(music,'note',(...args)=>notes.push(args));
  music.play(Array.from({length:10},(_,i)=>({type:'choir',slot:i+1})),0);
  assert.equal(notes.length,10);
  assert.ok(Math.abs(notes.reduce((sum,note)=>sum+note[2]**2,0)-1)<1e-10);
  assert.equal(new Set(notes.map(note=>note[3].variant)).size,10);
  assert.ok(notes.every(note=>note[0]===ROOTS[0]));
});

class Parameter {
  value=0;
  events=[];
  setValueAtTime(value,time){this.events.push(['set',value,time]);}
  linearRampToValueAtTime(value,time){this.events.push(['linear',value,time]);}
  exponentialRampToValueAtTime(value,time){assert.ok(value>0);this.events.push(['exponential',value,time]);}
  setTargetAtTime(value,time,constant){this.events.push(['target',value,time,constant]);}
  cancelScheduledValues(time){this.events.push(['cancel',time]);}
}
class AudioNode {
  constructor(){for(const name of ['gain','frequency','detune','pan','Q','threshold','knee','ratio','attack','release'])this[name]=new Parameter();}
  connect(destination){return destination;}
  disconnect(){this.disconnected=true;}
  start(time){this.started=time;}
  stop(time){this.stopped=time;}
  setPeriodicWave(wave){this.wave=wave;}
}
class TestContext {
  state='running';currentTime=0;sampleRate=48000;destination=new AudioNode();nodes=[];
  node(){const node=new AudioNode();this.nodes.push(node);return node;}
  createGain(){return this.node();}
  createBiquadFilter(){return this.node();}
  createDynamicsCompressor(){return this.node();}
  createWaveShaper(){return this.node();}
  createAnalyser(){return this.node();}
  createConvolver(){return this.node();}
  createStereoPanner(){return this.node();}
  createOscillator(){return this.node();}
  createBufferSource(){return this.node();}
  createPeriodicWave(real,imag){return {real,imag};}
  createBuffer(channels,length){const data=Array.from({length:channels},()=>new Float32Array(length));return {getChannelData:channel=>data[channel]};}
}

test('dense passages bound polyphony and drop background voices before foreground attacks', () => {
  const music=new Ensemble();music.initialize(TestContext);
  for(let i=0;i<50;i++)music.note(ROOTS[0],'choir',1,{variant:i,priority:1});
  const active=[...music.voices].filter(voice=>!voice.retiring);
  assert.ok(active.length<=32);
  assert.ok(active.reduce((sum,voice)=>sum+voice.cost,0)<=128);
  assert.ok([...music.voices].reduce((sum,voice)=>sum+voice.cost,0)<=160);
  const before=music.voices.size;
  music.note(ROOTS[0],'choir',.2,{priority:0});
  assert.equal(music.voices.size,before);
  assert.ok(active.every(voice=>!voice.retiring));
});

test('a key change fades the previous voices instead of cutting their waveforms abruptly', () => {
  const music=new Ensemble();music.initialize(TestContext);
  music.play([{type:'bell'}],0);
  const previous=[...music.voices];
  music.ctx.currentTime=.2;
  music.play([{type:'fork'}],1);
  assert.ok(previous.every(voice=>voice.retiring));
  for(const voice of previous) {
    assert.ok(voice.gate.gain.events.some(e=>e[0]==='target'&&e[1]===0));
    assert.ok(voice.sources.every(source=>source.stopped>music.ctx.currentTime));
  }
  assert.ok([...music.voices].some(voice=>!voice.retiring));
});

test('instrument sources finish cleanly and disconnect their transient audio graphs', () => {
  const music=new Ensemble();music.initialize(TestContext);
  music.play(['fork','bell','harp','drum','chamber','choir'].map(type=>({type})),0);
  const voices=[...music.voices], sources=voices.flatMap(voice=>voice.sources);
  assert.equal(voices.length,6);
  assert.ok(sources.every(source=>Number.isFinite(source.started)&&source.stopped>source.started));
  for(const source of sources)source.onended();
  assert.equal(music.voices.size,0);
  assert.ok(sources.every(source=>source.disconnected));
  assert.ok(voices.flatMap(voice=>voice.nodes).every(node=>node.disconnected));
});
