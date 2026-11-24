import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, align, canRecord, conductorRest, instrumentCost, newScore, payout, placeInstrument,
  record, removeInstrument, restore, serialize, setCircuit, transport } from '../game/engine.mjs';
import { MOVEMENTS, ENCORE_START, ENCORE_LENGTH, encoreRound, longBeats, movement, requirements } from '../game/levels.mjs';
import { circuitLayout } from '../game/art.mjs';

const step = (s, count) => Array.from({length: count}, () => advance(s)).flat();
const arrangements = [
  [[2,'bell']],
  [[1,'harp'],[2,'bell']],
  [[1,'drum'],[2,'bell']],
  [[1,'choir'],[2,'bell'],[4,'bell']],
  [[2,'bell'],[4,'bell']],
  [[2,'bell'],[4,'bell']],
  [[1,'harp'],[2,'bell'],[3,'drum'],[4,'bell'],[5,'choir'],[6,'bell']],
  [[1,'harp'],[2,'bell'],[4,'bell'],[5,'choir'],[6,'bell']],
  [[1,'harp'],[2,'bell'],[3,'harp'],[4,'bell'],[6,'bell']],
  [[1,'drum'],[2,'choir'],[3,'choir'],[4,'harp']],
  [[1,'harp'],[2,'bell'],[3,'harp'],[4,'bell'],[6,'bell']],
  [[1,'harp'],[2,'drum'],[3,'choir']],
  [[1,'drum'],[2,'bell'],[3,'choir']],
  [[1,'drum'],[2,'choir'],[3,'choir'],[4,'choir']],
  [[2,'bell'],[4,'bell'],[6,'bell'],[8,'bell']],
  [[1,'harp'],[2,'bell'],[3,'harp'],[4,'bell'],[5,'harp'],[6,'bell'],[8,'bell']],
  [[1,'drum'],[2,'choir'],[3,'choir'],[4,'choir']],
  [[1,'drum'],[2,'harp'],[3,'harp'],[4,'choir']],
  [[1,'drum'],[2,'bell'],[3,'harp'],[4,'harp']],
  [[1,'drum'],[2,'choir'],[3,'choir'],[4,'choir'],[5,'choir']],
  [[2,'bell'],[4,'bell'],[6,'bell'],[8,'bell'],[10,'bell']],
  [[1,'harp'],[2,'bell'],[3,'harp'],[4,'bell'],[5,'harp'],[6,'bell'],[7,'harp'],[8,'bell'],[10,'bell']],
  [[1,'harp'],[2,'bell'],[3,'harp'],[4,'bell'],[5,'choir'],[6,'bell'],[7,'choir'],[8,'bell'],[10,'bell']],
  [[1,'harp'],[2,'drum'],[3,'choir']],
  [[1,'drum'],[2,'harp'],[3,'harp'],[4,'choir'],[5,'choir'],[6,'choir'],[7,'choir'],[8,'choir']],
  [[1,'choir'],[2,'bell'],[3,'choir'],[4,'bell'],[5,'choir'],[6,'bell'],[8,'bell'],[10,'bell']],
  [[1,'drum'],[2,'bell'],[3,'harp'],[4,'harp'],[5,'choir'],[6,'choir']],
  [[1,'harp'],[2,'bell'],[3,'harp'],[4,'bell'],[5,'choir'],[6,'bell'],[7,'choir'],[8,'bell'],[9,'choir'],[10,'bell']]
];

test('all 28 movements and two full encore cycles can be earned, arranged, saved, and completed', () => {
  let s = newScore(0);
  const total = 68;
  assert.equal(MOVEMENTS.length,28);
  assert.equal(arrangements.length,28);
  for (let index=0;index<total;index++) {
    assert.equal(s.movement,index+1);
    const plan=arrangements[index<28?index:8+(index-28)%20];
    const level=movement(s);
    const cost=plan.reduce((total,[,type])=>total+instrumentCost(s,type),0n);
    transport(s);
    for(let beat=0;s.resonance<cost&&beat<2000;beat++) advance(s);
    assert.ok(s.resonance>=cost,'Movement '+s.movement+' must be affordable');
    for(const [slot,type] of plan) assert.equal(placeInstrument(s,type,slot),true);
    if(s.voices.length)align(s,level.alignment || 'unison');
    setCircuit(s,longBeats(s));
    const notes=step(s,longBeats(s)*8);
    assert.equal(s.status,'running','Movement '+s.movement+' must sustain');
    assert.equal(s.bars,8);
    for(const type of ['bell','harp','drum','choir']) {
      if(plan.some(([,instrument])=>instrument===type))assert.ok(notes.some(note=>note.type===type));
    }
    if(level.rest) {
      assert.equal(canRecord(s),false);
      conductorRest(s);step(s,longBeats(s));step(s,level.rest);
      assert.equal(conductorRest(s).multiplier,1n<<BigInt(level.rest));
    }
    assert.equal(canRecord(s),true,'Movement '+s.movement+' goals');
    const saved=restore(serialize(s),0);
    assert.equal(saved.movement,s.movement);
    assert.equal(saved.resonance,s.resonance);
    assert.deepEqual(saved.slots,s.slots);
    s=saved;
    assert.equal(record(s,0),true);
    assert.ok([4,6,8,10,12].includes(s.voices.at(-1).pattern.length));
  }
  assert.equal(s.movement,69);
  assert.equal(encoreRound(s),3);
});

test('extended circuits have complete, finite routes and increasing base returns', () => {
  const s=newScore();
  let last=0n;
  for(const beats of [4,6,8,10,12]) {
    const layout=circuitLayout(beats);
    assert.equal(layout.slots.length,beats-2);
    assert.equal(layout.long.length,beats);
    for(let i=0;i<beats;i++) {
      const segment=layout.long[i];
      assert.deepEqual(segment.at(-1),layout.long[(i+1)%beats][0]);
      for(const p of segment)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    }
    for(const p of [layout.fork,...layout.slots,layout.chamber]) {
      assert.ok(p.x>.05&&p.x<.95&&p.y>.04&&p.y<.95,'Keep instruments within the board');
    }
    assert.ok(payout(s,beats)>last);
    last=payout(s,beats);
  }
});

test('encores begin after movement 28 and revisit every advanced movement', () => {
  assert.equal(new Set(MOVEMENTS.map(level=>level.title)).size,28);
  assert.equal(ENCORE_START,8);
  assert.equal(ENCORE_LENGTH,20);
  assert.equal(encoreRound({movement:28}),0);
  assert.equal(movement({movement:29}).title,'Twin Strings · Encore 1');
  assert.equal(movement({movement:48}).title,'Beyond the Last Note · Encore 1');
  assert.equal(movement({movement:49}).title,'Twin Strings · Encore 2');
});

test('instrument limits, omitted instruments, and stagger goals gate recording', () => {
  const s=newScore(0);
  Object.assign(s,{movement:12,circuit:8,slots:['harp','drum','choir',null,null,null],
    voices:[{key:0,pattern:[1,0,2,4]}],bars:8,alignment:'unison'});
  assert.equal(canRecord(s),true);
  s.slots[3]='bell';
  assert.equal(canRecord(s),false,'An extra instrument exceeds the trio limit');
  Object.assign(s,{movement:11,slots:['harp','bell','harp','bell','drum','bell']});
  assert.equal(canRecord(s),false,'A forbidden drum cannot be recorded');
  s.slots[4]=null;
  assert.equal(canRecord(s),true);
  Object.assign(s,{movement:10,slots:['drum','choir','choir','harp',null,null]});
  assert.equal(canRecord(s),false,'Unison cannot satisfy a stagger challenge');
  s.alignment='stagger';
  assert.equal(canRecord(s),true);
  assert.ok(requirements(s).some(goal=>goal.label==='Stagger the recorded phrases'&&goal.met));
});

test('a thirty-twofold rest requires five held beats and a sixth beat still fades', () => {
  const s=newScore();
  Object.assign(s,{movement:19,circuit:10,slots:['drum','bell','harp','harp',null,null,null,null],bars:8,status:'running'});
  conductorRest(s);step(s,10);step(s,4);
  assert.equal(conductorRest(s).multiplier,16n);
  assert.equal(canRecord(s),false);
  conductorRest(s);step(s,10);step(s,5);
  assert.equal(conductorRest(s).multiplier,32n);
  assert.equal(canRecord(s),true);
  conductorRest(s);step(s,10);step(s,6);
  assert.equal(s.status,'faded');
  assert.equal(canRecord(s),false);
});

test('version two encore saves keep earnings, voices, and instruments when their boards expand', () => {
  for(let number=9;number<=49;number++) {
    const beats=[6,6,6,8,8][(number-9)%5];
    const slots=Array(beats-2).fill(null);slots[1]='bell';slots[2]='harp';
    const old={...newScore(0),version:2,movement:number,circuit:beats,slots,phase:1,beat:1,bars:5,
      voices:[{key:0,pattern:[1,0,2,4]},{key:1,pattern:[1,0,2,0,0,4]},{key:2,pattern:[1,0,2,0,0,0,0,4]}],
      resonance:'9007199254740993123456',archiveYield:'987654321',status:'running',volume:.45,bestRest:3};
    const recovered=restore(JSON.stringify(old),0);
    assert.equal(recovered.movement,number);
    assert.equal(recovered.resonance,9007199254740993123456n);
    assert.equal(recovered.archiveYield,987654321n);
    assert.deepEqual(recovered.voices,old.voices);
    assert.deepEqual(recovered.slots.slice(0,slots.length),slots);
    assert.equal(recovered.slots.length,longBeats(recovered)-2);
    assert.equal(recovered.bestRest,3);
    assert.equal(recovered.volume,.45);
    assert.equal(recovered.status,'paused');
    assert.equal(recovered.circuit,beats===longBeats(recovered)?beats:2);
    assert.equal(recovered.bars,beats===longBeats(recovered)?5:0);
    assert.equal(restore(serialize(recovered),0).movement,number);
  }
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
