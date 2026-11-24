import { INSTRUMENTS, countInstrument, longBeats, requirements } from './levels.mjs';

export const TARGET_BARS = 8;
export const TEMPOS = [72, 96, 120];
export const ROOTS = [146.83, 174.61, 196, 130.81, 164.81, 220];
export const KEYS = ['D', 'F', 'G', 'C', 'E', 'A'];
const MAX_AWAY_MS = 8 * 60 * 60 * 1000;

export function newScore(now = Date.now()) {
  return {
    movement: 1, resonance: 0n, archiveYield: 0n, voices: [], archiveTime: now,
    circuit: 2, slots: [null, null], phase: 0, beat: 0, age: 0, bars: 0, status: 'ready',
    alignment: 'stagger', restQueued: false, resting: false, restBeats: 0, bestRest: 0,
    tempo: 96, muted: false, volume: .7
  };
}

export const unit = s => 1n << BigInt(s.movement - 1);
export const instrumentCost = (s, type) => BigInt(INSTRUMENTS[type].cost) * unit(s);
export const keyIndex = s => (s.movement - 1) % ROOTS.length;
export const canRecord = s => s.circuit === longBeats(s) && s.bars >= TARGET_BARS &&
  s.status !== 'faded' && requirements(s).every(goal => goal.met);

export function payout(s, circuit = s.circuit) {
  if (circuit === 2) return unit(s);
  const value = {4: 6n, 6: 18n, 8: 42n, 10: 90n, 12: 186n}[circuit];
  const harps = BigInt(countInstrument(s, 'harp'));
  const unison = s.voices.length > 0 && s.alignment === 'unison';
  const choirs = unison ? countInstrument(s, 'choir') : 0;
  const multiplier = 1n << BigInt(choirs + (unison ? 1 : 0));
  const drumCost = countInstrument(s, 'drum') ? 2n : 1n;
  return unit(s) * value * (2n + harps) * multiplier / (2n * drumCost);
}

function rewind(s) {
  Object.assign(s, { phase: 0, beat: 0, age: 0, bars: 0, restQueued: false, resting: false, restBeats: 0 });
  if (s.status === 'faded') s.status = 'ready';
}

export function transport(s) {
  if (s.status === 'running') s.status = 'paused';
  else {
    if (s.status === 'faded') rewind(s);
    s.status = 'running';
  }
}

export function setCircuit(s, beats) {
  if (![2, longBeats(s)].includes(beats) || s.circuit === beats) return false;
  s.circuit = beats;
  rewind(s);
  return true;
}

export function placeInstrument(s, type, beat, from = 0) {
  const definition = INSTRUMENTS[type];
  if (!definition || s.movement < definition.unlock || !Number.isInteger(beat) ||
      beat < 1 || beat > s.slots.length || !Number.isInteger(from) || from < 0 ||
      from > s.slots.length || from === beat) return false;
  const previous = s.slots[beat - 1];
  if (from) {
    if (s.slots[from - 1] !== type) return false;
    s.slots[from - 1] = previous;
  } else {
    if (previous === type) return false;
    const refund = previous ? instrumentCost(s, previous) : 0n;
    const cost = instrumentCost(s, type) - refund;
    if (s.resonance < cost) return false;
    s.resonance -= cost;
  }
  s.slots[beat - 1] = type;
  rewind(s);
  return true;
}

export function removeInstrument(s, beat) {
  const type = s.slots[beat - 1];
  if (!type) return false;
  s.resonance += instrumentCost(s, type);
  s.slots[beat - 1] = null;
  rewind(s);
  return true;
}

export function align(s, mode) {
  if (!s.voices.length || !['unison', 'stagger'].includes(mode) || mode === s.alignment) return false;
  s.alignment = mode;
  rewind(s);
  return true;
}

export function settleArchive(s, now = Date.now()) {
  const barMs = 240000 / s.tempo;
  if (now < s.archiveTime || s.archiveYield === 0n) {
    s.archiveTime = now;
    return 0n;
  }
  const elapsed = Math.min(now - s.archiveTime, MAX_AWAY_MS);
  const bars = Math.floor(elapsed / barMs);
  const income = BigInt(bars) * s.archiveYield;
  s.resonance += income;
  s.archiveTime = now - (elapsed - bars * barMs);
  return income;
}

function silence(s, events) {
  s.status = 'faded';
  s.bars = 0;
  s.resting = false;
  s.restQueued = false;
  events.push({ type: 'fade' });
  return events;
}

export function phraseEvents(s, beat) {
  const offset = s.alignment === 'stagger' ? 2 : 0;
  return s.voices.map(voice => ({ type: 'phrase',
    mask: voice.pattern[(beat + offset) % voice.pattern.length], key: voice.key })).filter(e => e.mask);
}

export function instrumentNotes(s, beat) {
  if (s.circuit === 2) return [];
  const phase = beat % s.circuit;
  const notes = [];
  s.slots.forEach((type, i) => {
    const slot = i + 1;
    if ((type === 'bell' || type === 'harp') && phase === slot) notes.push({type, slot});
    if (type === 'drum' && beat % 2 === 0) notes.push({type, slot});
    if (type === 'choir' && phase === 0) notes.push({type, slot});
  });
  return notes;
}

export function advance(s) {
  const events = [];
  if (s.status !== 'running') return events;
  s.beat += 1;
  s.age += 1;
  if (s.resting) {
    s.restBeats += 1;
    const bellSlot = s.slots.indexOf('bell') + 1;
    if (s.restBeats === 3 && bellSlot) {
      s.age = 0;
      events.push({ type: 'bell', slot: bellSlot, delayed: true });
    }
    return s.age >= 3 ? silence(s, events) : events;
  }

  s.phase = (s.phase + 1) % s.circuit;
  if (s.age >= 3) return silence(s, events);
  const voices = phraseEvents(s, s.beat);
  events.push(...voices);
  if (voices.some(voice => voice.mask & 1)) s.age = 0;
  const notes = instrumentNotes(s, s.beat);
  events.push(...notes);
  if (notes.some(note => note.type === 'bell' || note.type === 'drum')) s.age = 0;

  if (s.phase === s.circuit - 1) events.push({ type: 'chamber' });
  if (s.phase === 0) {
    s.age = 0;
    const value = payout(s);
    s.resonance += value;
    if (s.circuit === longBeats(s)) s.bars = Math.min(TARGET_BARS, s.bars + 1);
    events.push({ type: 'fork' }, { type: 'return', value });
    if (s.restQueued) {
      s.restQueued = false;
      s.resting = true;
      s.restBeats = 0;
      events.push({ type: 'rest' });
    }
  }
  return events;
}

export function conductorRest(s) {
  if (s.movement < 3 || s.status !== 'running' || s.circuit === 2) return null;
  if (!s.resting) {
    s.restQueued = !s.restQueued;
    return { type: s.restQueued ? 'queued' : 'cancelled' };
  }
  const multiplier = 1n << BigInt(s.restBeats);
  const value = payout(s) * (multiplier - 1n);
  s.resonance += value;
  s.bestRest = Math.max(s.bestRest, s.restBeats);
  Object.assign(s, { resting: false, age: 0, beat: 0, phase: 0, restBeats: 0 });
  return { type: 'release', value, multiplier };
}

export function record(s, now = Date.now()) {
  if (!canRecord(s) || s.resting) return false;
  settleArchive(s, now);
  const pattern = Array(s.circuit).fill(0);
  pattern[0] = 1;
  pattern[s.circuit - 1] = 4;
  const masks = { bell: 2, harp: 8, drum: 16, choir: 32 };
  for (let beat = 1; beat <= s.circuit; beat++) {
    for (const note of instrumentNotes(s, beat)) pattern[beat % s.circuit] |= masks[note.type];
  }
  s.voices.push({ key: keyIndex(s), pattern });
  s.voices = s.voices.slice(-3);
  s.archiveYield += payout(s) * 4n / BigInt(s.circuit);
  s.movement += 1;
  s.status = 'ready';
  s.circuit = 2;
  s.slots = Array(longBeats(s) - 2).fill(null);
  s.bestRest = 0;
  s.alignment = 'stagger';
  s.archiveTime = now;
  rewind(s);
  return true;
}

export function serialize(s) {
  return JSON.stringify({ ...s, version: 3, resonance: s.resonance.toString(), archiveYield: s.archiveYield.toString() });
}

const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
export function restore(raw, now = Date.now()) {
  if (!raw) return newScore(now);
  try {
    const v = JSON.parse(raw);
    if (![1, 2, 3].includes(v.version) || !integer(v.movement, 1, 1000000)) return newScore(now);
    if (v.version === 1) {
      v.slots = Array(longBeats(v) - 2).fill(null);
      if ([1, 2].includes(v.bell)) v.slots[v.bell - 1] = 'bell';
      v.bestRest = 0;
      if (v.circuit === 4 && longBeats(v) !== 4) {
        Object.assign(v, {circuit: 2, phase: 0, beat: 0, bars: 0, age: 0, restQueued: false, resting: false, restBeats: 0});
      }
    }
    if (v.version === 2 && v.movement > 8) {
      const oldBeats = [6, 6, 6, 8, 8][(v.movement - 9) % 5];
      if (!Array.isArray(v.slots) || v.slots.length !== oldBeats - 2 ||
          ![2, oldBeats].includes(v.circuit) || !integer(v.phase, 0, v.circuit - 1)) return newScore(now);
      if (oldBeats !== longBeats(v)) {
        v.slots = [...v.slots, ...Array(longBeats(v) - oldBeats).fill(null)];
        Object.assign(v, {circuit: 2, phase: 0, beat: 0, bars: 0, age: 0, restQueued: false, resting: false, restBeats: 0});
      }
    }
    if (!/^\d+$/.test(v.resonance) || !/^\d+$/.test(v.archiveYield) ||
        ![2, longBeats(v)].includes(v.circuit) || !Array.isArray(v.slots) || v.slots.length !== longBeats(v) - 2 ||
        !v.slots.every(type => type === null || (Object.hasOwn(INSTRUMENTS, type) && INSTRUMENTS[type].unlock <= v.movement)) ||
        !Array.isArray(v.voices) || v.voices.length !== Math.min(3, v.movement - 1) ||
        !v.voices.every(p => integer(p.key, 0, ROOTS.length - 1) && Array.isArray(p.pattern) &&
          [4, 6, 8, 10, 12].includes(p.pattern.length) && p.pattern.every(mask => integer(mask, 0, 63))) ||
        !integer(v.phase, 0, v.circuit - 1) || !integer(v.age, 0, 3) ||
        !integer(v.beat, 0, Number.MAX_SAFE_INTEGER) || !integer(v.bars, 0, TARGET_BARS) ||
        !integer(v.restBeats, 0, 6) || !integer(v.bestRest, 0, 5) || !Number.isFinite(v.archiveTime) || !TEMPOS.includes(v.tempo) ||
        !['ready', 'paused', 'running', 'faded'].includes(v.status) ||
        !['stagger', 'unison'].includes(v.alignment)) return newScore(now);
    return { ...newScore(now), movement: v.movement, resonance: BigInt(v.resonance),
      archiveYield: BigInt(v.archiveYield), voices: v.voices, archiveTime: v.archiveTime,
      circuit: v.circuit, slots: v.slots, phase: v.phase, beat: v.beat, age: v.age, bars: v.bars,
      restQueued: !!v.restQueued, resting: !!v.resting, restBeats: v.restBeats, bestRest: v.bestRest,
      alignment: v.alignment, tempo: v.tempo, muted: !!v.muted,
      volume: Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1 ? v.volume : .7,
      status: v.status === 'running' ? 'paused' : v.status };
  } catch { return newScore(now); }
}

export function amount(n) {
  const digits = n.toString();
  if (digits.length <= 4) return Number(n).toLocaleString('en-US');
  const tier = Math.floor((digits.length - 1) / 3);
  const head = digits.length - tier * 3;
  const suffixes = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi'];
  if (tier < suffixes.length) return digits.slice(0, head) + (digits[head] === '0' ? '' : '.' + digits[head]) + suffixes[tier];
  return digits[0] + '.' + digits.slice(1, 3) + 'e' + (digits.length - 1);
}
