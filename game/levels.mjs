export const INSTRUMENTS = {
  bell: { name: 'Glass bell', unlock: 1, cost: 3, color: '#89d7ca', icon: 'bell',
    description: 'Answers the fork when the note reaches its socket.' },
  harp: { name: 'Echo harp', unlock: 2, cost: 5, color: '#edb3d2', icon: 'harp',
    description: 'Adds 50% to every long return. Each harp adds another 50%.' },
  drum: { name: 'Pulse drum', unlock: 3, cost: 8, color: '#f0ad81', icon: 'drum',
    description: 'Sustains the fork every two beats. Using drums halves the long return.' },
  choir: { name: 'Choir', unlock: 4, cost: 12, color: '#b7b0fa', icon: 'choir',
    description: 'Joins the returning chord. Each choir doubles its value in unison.' }
};

export const MOVEMENTS = [
  { title: 'The First Echo', beats: 4, requires: {}, lesson: 'Keep a four-beat circuit alive with an answering bell.' },
  { title: 'Counterpoint', beats: 4, requires: {harp: 1}, lesson: 'Add an echo harp. Let your recorded phrase cover the gaps.' },
  { title: 'A Steady Heart', beats: 4, requires: {drum: 1}, lesson: 'Build a pulse drum to keep time. Its steady heartbeat costs half the return.' },
  { title: 'Chorus of Light', beats: 6, requires: {choir: 1}, lesson: 'Fill a six-beat circuit with voices. A choir rewards playing in unison.' },
  { title: 'Threads of Glass', beats: 6, requires: {bell: 2}, lesson: 'Place two glass bells to answer across a six-beat journey.' },
  { title: 'The Conductor’s Rest', beats: 6, requires: {bell: 1}, rest: 3, lesson: 'Hold a rest for three beats, then release the chord for an eightfold return.' },
  { title: 'A Glass Horizon', beats: 8, requires: {harp: 1, drum: 1, choir: 1}, lesson: 'Bring harp, drum, and choir together on the first eight-beat circuit.' },
  { title: 'The Last Note Rises', beats: 8, requires: {bell: 3, harp: 1, choir: 1}, alignment: 'unison', lesson: 'Build three answering bells and bring harp and choir into unison.' }
];

export function movement(s) {
  if (s.movement <= MOVEMENTS.length) return MOVEMENTS[s.movement - 1];
  const index = 3 + (s.movement - 9) % 5;
  return { ...MOVEMENTS[index], title: MOVEMENTS[index].title + ' · Encore ' + (Math.floor((s.movement - 9) / 5) + 1) };
}

export const longBeats = s => movement(s).beats;
export const countInstrument = (s, type) => s.slots.filter(slot => slot === type).length;

export function requirements(s) {
  const level = movement(s);
  const goals = Object.entries(level.requires).map(([type, count]) => ({
    label: count + ' ' + INSTRUMENTS[type].name.toLowerCase() + (count > 1 ? 's' : ''),
    met: countInstrument(s, type) >= count
  }));
  if (level.rest) goals.push({label: 'Release a ×' + 2 ** level.rest + ' rest', met: s.bestRest >= level.rest});
  if (level.alignment) goals.push({label: 'Play in unison', met: s.alignment === level.alignment});
  return goals;
}
