export const TARGET_BARS = 8;
export const TEMPOS = [72, 96, 120];
export const ROOTS = [146.83, 174.61, 196, 130.81, 164.81, 220];
export const KEYS = ['D', 'F', 'G', 'C', 'E', 'A'];
const MAX_AWAY_MS = 8 * 60 * 60 * 1000;

export function newScore(now = Date.now()) {
  return {
    movement: 1, resonance: 0n, archiveYield: 0n, voices: [], archiveTime: now,
    circuit: 2, bell: 0, phase: 0, beat: 0, age: 0, bars: 0, status: 'ready',
    alignment: 'stagger', restQueued: false, resting: false, restBeats: 0,
    tempo: 96, muted: false
  };
}

export const unit = s => 1n << BigInt(s.movement - 1);
export const bellCost = s => 3n * unit(s);
export const keyIndex = s => (s.movement - 1) % ROOTS.length;
export const canRecord = s => s.circuit === 4 && s.bars >= TARGET_BARS && s.status !== 'faded';

export function payout(s, circuit = s.circuit) {
  const chord = s.voices.length && s.alignment === 'unison' && circuit === 4;
  return unit(s) * (circuit === 2 ? 1n : 6n) * (chord ? 2n : 1n);
}

function rewind(s) {
  Object.assign(s, { phase: 0, beat: 0, age: 0, bars: 0, restQueued: false, resting: false, restBeats: 0 });
  if (s.status === 'faded') s.status = 'ready';
}

export function transport(s) {
  if (s.status === 'running') {
    s.status = 'paused';
  } else {
    if (s.status === 'faded') rewind(s);
    s.status = 'running';
  }
}

export function setCircuit(s, beats) {
  if (![2, 4].includes(beats) || s.circuit === beats) return false;
  s.circuit = beats;
  rewind(s);
  return true;
}

export function placeBell(s, beat) {
  if (![1, 2].includes(beat) || s.bell === beat) return false;
  if (!s.bell) {
    const price = bellCost(s);
    if (s.resonance < price) return false;
    s.resonance -= price;
  }
  s.bell = beat;
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

export function advance(s) {
  const events = [];
  if (s.status !== 'running') return events;
  s.beat += 1;
  s.age += 1;

  if (s.resting) {
    s.restBeats += 1;
    if (s.restBeats === 3 && s.bell) {
      s.age = 0;
      events.push({ type: 'bell', delayed: true });
    }
    return s.age >= 3 ? silence(s, events) : events;
  }

  s.phase = (s.phase + 1) % s.circuit;
  if (s.age >= 3) return silence(s, events);

  const voicePhase = (s.beat + (s.alignment === 'stagger' ? 2 : 0)) % 4;
  for (const voice of s.voices) {
    const mask = voice.pattern[voicePhase];
    if (mask) events.push({ type: 'phrase', mask, key: voice.key });
  }
  if (s.voices.length && voicePhase === 0) s.age = 0;

  if (s.circuit === 4 && s.bell && s.phase === s.bell) {
    s.age = 0;
    events.push({ type: 'bell' });
  }
  if (s.phase === s.circuit - 1) events.push({ type: 'chamber' });
  if (s.phase === 0) {
    s.age = 0;
    const value = payout(s);
    s.resonance += value;
    if (s.circuit === 4) s.bars = Math.min(TARGET_BARS, s.bars + 1);
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
  if (s.movement < 3 || s.status !== 'running' || s.circuit !== 4) return null;
  if (!s.resting) {
    s.restQueued = !s.restQueued;
    return { type: s.restQueued ? 'queued' : 'cancelled' };
  }
  const multiplier = 1n << BigInt(s.restBeats);
  const value = payout(s) * (multiplier - 1n);
  s.resonance += value;
  Object.assign(s, { resting: false, age: 0, beat: 0, phase: 0, restBeats: 0 });
  return { type: 'release', value, multiplier };
}

export function record(s, now = Date.now()) {
  if (!canRecord(s) || s.resting) return false;
  settleArchive(s, now);
  const pattern = [1, 0, 0, 4];
  if (s.bell) pattern[s.bell] |= 2;
  s.voices.push({ key: keyIndex(s), pattern });
  // The newest parts are audible. The entire archive contributes to income.
  s.voices = s.voices.slice(-3);
  s.archiveYield += payout(s);
  s.movement += 1;
  s.status = 'ready';
  s.circuit = 2;
  s.bell = 0;
  s.alignment = 'stagger';
  s.archiveTime = now;
  rewind(s);
  return true;
}

export function serialize(s) {
  return JSON.stringify({ ...s, version: 1, resonance: s.resonance.toString(), archiveYield: s.archiveYield.toString() });
}

const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
export function restore(raw, now = Date.now()) {
  if (!raw) return newScore(now);
  try {
    const v = JSON.parse(raw);
    if (v.version !== 1 || !integer(v.movement, 1, 1000000) || !/^\d+$/.test(v.resonance) ||
        !/^\d+$/.test(v.archiveYield) || ![2, 4].includes(v.circuit) || ![0, 1, 2].includes(v.bell) ||
        !Array.isArray(v.voices) || v.voices.length !== Math.min(3, v.movement - 1) ||
        !v.voices.every(p => integer(p.key, 0, ROOTS.length - 1) && Array.isArray(p.pattern) &&
          p.pattern.length === 4 && p.pattern.every(mask => integer(mask, 0, 7))) ||
        !integer(v.phase, 0, v.circuit - 1) || !integer(v.age, 0, 3) ||
        !integer(v.beat, 0, Number.MAX_SAFE_INTEGER) || !integer(v.bars, 0, TARGET_BARS) ||
        !integer(v.restBeats, 0, 6) || !Number.isFinite(v.archiveTime) || !TEMPOS.includes(v.tempo) ||
        !['ready', 'paused', 'running', 'faded'].includes(v.status) ||
        !['stagger', 'unison'].includes(v.alignment)) return newScore(now);
    return { ...newScore(now), movement: v.movement, resonance: BigInt(v.resonance),
      archiveYield: BigInt(v.archiveYield), voices: v.voices, archiveTime: v.archiveTime,
      circuit: v.circuit, bell: v.bell, phase: v.phase, beat: v.beat, age: v.age, bars: v.bars,
      restQueued: !!v.restQueued, resting: !!v.resting, restBeats: v.restBeats,
      alignment: v.alignment, tempo: v.tempo, muted: !!v.muted, status: v.status === 'running' ? 'paused' : v.status };
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
