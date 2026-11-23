import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Ensemble } from '../game/music.mjs';

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
