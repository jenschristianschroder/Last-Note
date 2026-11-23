import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, align, canRecord, conductorRest, instrumentCost, newScore, payout, placeInstrument,
  record, removeInstrument, restore, serialize, setCircuit, transport } from '../game/engine.mjs';
import { longBeats, movement } from '../game/levels.mjs';

const step = (s, count) => Array.from({length: count}, () => advance(s)).flat();
const arrangements = [
  [[2,'bell']],
  [[1,'harp'],[2,'bell']],
  [[1,'drum'],[2,'bell']],
  [[1,'choir'],[2,'bell'],[4,'bell']],
  [[2,'bell'],[4,'bell']],
  [[2,'bell'],[4,'bell']],
  [[1,'harp'],[2,'bell'],[3,'drum'],[4,'bell'],[5,'choir'],[6,'bell']],
  [[1,'harp'],[2,'bell'],[4,'bell'],[5,'choir'],[6,'bell']]
];

test('all eight movements and five encores can be earned, arranged, saved, and completed', () => {
  let s = newScore(0);
  for (let index=0;index<13;index++) {
    assert.equal(s.movement,index+1);
    const plan=arrangements[index<8?index:3+(index-8)%5];
    const cost=plan.reduce((total,[,type])=>total+instrumentCost(s,type),0n);
    transport(s);
    for(let beat=0;s.resonance<cost&&beat<2000;beat++) advance(s);
    assert.ok(s.resonance>=cost,'Movement '+s.movement+' must be affordable');
    for(const [slot,type] of plan) assert.equal(placeInstrument(s,type,slot),true);
    if(s.voices.length)align(s,'unison');
    setCircuit(s,longBeats(s));
    const notes=step(s,longBeats(s)*8);
    assert.equal(s.status,'running','Movement '+s.movement+' must sustain');
    assert.equal(s.bars,8);
    for(const type of ['bell','harp','drum','choir']) {
      if(plan.some(([,instrument])=>instrument===type))assert.ok(notes.some(note=>note.type===type));
    }
    if(movement(s).rest) {
      assert.equal(canRecord(s),false);
      conductorRest(s);step(s,longBeats(s));step(s,3);
      assert.equal(conductorRest(s).multiplier,8n);
    }
    assert.equal(canRecord(s),true,'Movement '+s.movement+' goals');
    const saved=restore(serialize(s),0);
    assert.equal(saved.movement,s.movement);
    assert.equal(saved.resonance,s.resonance);
    assert.deepEqual(saved.slots,s.slots);
    s=saved;
    assert.equal(record(s,0),true);
    assert.ok([4,6,8].includes(s.voices.at(-1).pattern.length));
  }
  assert.equal(s.movement,14);
});

test('new instruments unlock gradually and moving or replacing them keeps balances consistent', () => {
  const s=newScore();
  s.resonance=40n;
  assert.equal(placeInstrument(s,'harp',1),false);
  assert.equal(s.resonance,40n);
  assert.equal(placeInstrument(s,'bell',1),true);
  assert.equal(placeInstrument(s,'bell',2),true);
  assert.equal(s.resonance,34n);
  assert.equal(placeInstrument(s,'bell',2,1),true);
  assert.equal(s.resonance,34n);
  assert.equal(removeInstrument(s,1),true);
  assert.equal(s.resonance,37n);
  assert.equal(removeInstrument(s,1),false);
  assert.equal(s.resonance,37n);
  s.movement=2;
  s.resonance=20n;
  assert.equal(placeInstrument(s,'harp',2),true);
  assert.equal(s.resonance,16n);
  assert.deepEqual(s.slots,[null,'harp']);
});

test('harps, drums, and choirs alter returns with distinct rules', () => {
  const s=newScore();
  Object.assign(s,{movement:4,circuit:6,slots:[null,null,null,null],voices:[{key:0,pattern:[1,0,2,4]}]});
  const base=payout(s);
  s.slots[0]='harp';
  assert.equal(payout(s),base*3n/2n);
  s.slots[1]='drum';
  assert.equal(payout(s),base*3n/4n);
  s.slots[2]='choir';
  assert.equal(payout(s),base*3n/4n);
  align(s,'unison');
  assert.equal(payout(s),base*3n);
  assert.equal(payout(s,2),8n);
});

test('an old saved score migrates its bell and keeps its earned progress', () => {
  const old={...newScore(0),version:1,bell:2,movement:7,circuit:4,phase:2,beat:10,bars:2,
    voices:[{key:0,pattern:[1,0,2,4]},{key:1,pattern:[1,0,2,4]},{key:2,pattern:[1,0,2,4]}],
    resonance:'9876',archiveYield:'126',status:'running'};
  delete old.slots;delete old.bestRest;delete old.volume;
  const s=restore(JSON.stringify(old),0);
  assert.equal(s.movement,7);
  assert.equal(s.resonance,9876n);
  assert.equal(s.archiveYield,126n);
  assert.equal(s.voices.length,3);
  assert.equal(s.slots.length,6);
  assert.equal(s.slots[1],'bell');
  assert.equal(s.circuit,2);
  assert.equal(s.phase,0);
  assert.equal(s.status,'paused');
  assert.equal(s.volume,.7);
});
