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
  { title: 'The Last Note Rises', beats: 8, requires: {bell: 3, harp: 1, choir: 1}, alignment: 'unison', lesson: 'Build three answering bells and bring harp and choir into unison.' },
  { title: 'Twin Strings', beats: 8, requires: {bell: 3, harp: 2}, lesson: 'Weave two harps between three answering bells. Their bonuses add together.' },
  { title: 'Echoes in Opposition', beats: 8, requires: {drum: 1, harp: 1, choir: 2}, alignment: 'stagger', lesson: 'Stagger the archive beneath two choirs, a harp, and a steady drum.' },
  { title: 'The Quiet Engine', beats: 8, requires: {bell: 3, harp: 2}, without: ['drum'], alignment: 'unison', lesson: 'Leave out the drums. Three bells must carry two harps through a return in unison.' },
  { title: 'Three Hands', beats: 8, requires: {harp: 1, drum: 1, choir: 1}, maxInstruments: 3, alignment: 'unison', lesson: 'Make every voice count: one harp, one drum, one choir, and no other instruments.' },
  { title: 'The Long Breath', beats: 8, requires: {bell: 1, drum: 1, choir: 1}, rest: 4, lesson: 'Let a bell bridge the silence, then hold one beat longer for a sixteenfold release.' },
  { title: 'Resonant Quartet', beats: 8, requires: {choir: 3, drum: 1}, maxInstruments: 4, alignment: 'unison', lesson: 'Three choirs multiply one another. A single drum keeps this four-piece ensemble alive.' },
  { title: 'The Fifth Answer', beats: 10, requires: {bell: 4}, without: ['drum'], lesson: 'The circuit stretches to ten beats. Space four bells across it without percussion.' },
  { title: 'Woven Starlight', beats: 10, requires: {bell: 4, harp: 3}, lesson: 'Interleave three harps with four bells along the longer route.' },
  { title: 'Procession of Echoes', beats: 10, requires: {choir: 3, drum: 1}, maxInstruments: 4, alignment: 'stagger', lesson: 'Keep a ten-beat procession ringing with only four instruments and a staggered archive.' },
  { title: 'One Heartbeat', beats: 10, requires: {drum: 1, harp: 2, choir: 1}, maxInstruments: 4, alignment: 'unison', lesson: 'Trust one drum to sustain two harps and a choir. Keep the arrangement to four instruments.' },
  { title: 'A Measure of Silence', beats: 10, requires: {bell: 1, drum: 1, harp: 2}, rest: 5, lesson: 'Hold five silent beats for a thirty-twofold release. The sixth beat is too late.' },
  { title: 'Cathedral of Sound', beats: 10, requires: {choir: 4, drum: 1}, maxInstruments: 5, alignment: 'unison', lesson: 'Build a cathedral from four choirs and one drum. Bring every choir into unison.' },
  { title: 'The Twelvefold Path', beats: 12, requires: {bell: 5}, without: ['drum'], lesson: 'Five answering bells must span a twelve-beat circuit. Find the safe gaps without drums.' },
  { title: 'The Silver Loom', beats: 12, requires: {bell: 5, harp: 4}, without: ['drum'], lesson: 'Weave four harps through five bells. Nine instruments share the twelve-beat path.' },
  { title: 'Double Exposure', beats: 12, requires: {bell: 5, harp: 2, choir: 2}, without: ['drum'], alignment: 'unison', lesson: 'Balance two harps and two choirs against five bells, with no drum to cover a missed echo.' },
  { title: 'The Empty Stage', beats: 12, requires: {harp: 1, drum: 1, choir: 1}, maxInstruments: 3, alignment: 'stagger', lesson: 'Leave seven sockets empty. A trio and a staggered archive must fill the whole stage.' },
  { title: 'Distant Stars', beats: 12, requires: {choir: 5, harp: 2, drum: 1}, alignment: 'unison', lesson: 'Join five choirs in unison while two harps lift their return. Let the drum carry the gaps.' },
  { title: 'The Unbroken Thread', beats: 12, requires: {bell: 5, choir: 3}, maxInstruments: 8, without: ['drum'], alignment: 'unison', lesson: 'Five bells, three choirs, and nothing else. Keep every link in the twelve-beat thread intact.' },
  { title: 'The Edge of Silence', beats: 12, requires: {bell: 1, drum: 1, harp: 2, choir: 2}, maxInstruments: 6, alignment: 'unison', rest: 5, lesson: 'Build a six-piece ensemble in unison, then hold its returning chord to the edge of silence.' },
  { title: 'Beyond the Last Note', beats: 12, requires: {bell: 5, harp: 2, choir: 3}, without: ['drum'], alignment: 'unison', rest: 5, lesson: 'Fill every socket with bells, harps, and choirs. Sustain the full circuit and release a thirty-twofold rest to open the encores.' }
];

// Encores revisit the twenty advanced arrangements after the authored campaign.
export const ENCORE_START = 8;
export const ENCORE_LENGTH = MOVEMENTS.length - ENCORE_START;
export const encoreRound = s => Math.max(0, Math.floor((s.movement - MOVEMENTS.length - 1) / ENCORE_LENGTH) + 1);

export function movement(s) {
  if (s.movement <= MOVEMENTS.length) return MOVEMENTS[s.movement - 1];
  const index = ENCORE_START + (s.movement - MOVEMENTS.length - 1) % ENCORE_LENGTH;
  return { ...MOVEMENTS[index], title: MOVEMENTS[index].title + ' · Encore ' + encoreRound(s) };
}

export const longBeats = s => movement(s).beats;
export const countInstrument = (s, type) => s.slots.filter(slot => slot === type).length;

export function requirements(s) {
  const level = movement(s);
  const goals = Object.entries(level.requires).map(([type, count]) => ({
    label: count + ' ' + INSTRUMENTS[type].name.toLowerCase() + (count > 1 ? 's' : ''),
    met: countInstrument(s, type) >= count
  }));
  for (const type of level.without || []) goals.push({
    label: 'No ' + INSTRUMENTS[type].name.toLowerCase() + 's', met: countInstrument(s, type) === 0
  });
  if (level.maxInstruments) goals.push({
    label: 'At most ' + level.maxInstruments + ' instruments', met: s.slots.filter(Boolean).length <= level.maxInstruments
  });
  if (level.rest) goals.push({label: 'Release a ×' + 2 ** level.rest + ' rest', met: s.bestRest >= level.rest});
  if (level.alignment) goals.push({label: level.alignment === 'unison' ? 'Play in unison' : 'Stagger the recorded phrases', met: s.alignment === level.alignment});
  return goals;
}
