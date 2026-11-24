import { TARGET_BARS, TEMPOS, KEYS, advance, align, amount, canRecord, conductorRest, instrumentCost, instrumentNotes, keyIndex,
  newScore, payout, phraseEvents, placeInstrument, removeInstrument, record, restore, serialize, setCircuit, settleArchive, transport } from './engine.mjs';
import { circuitLayout, cosmos, icon, OrbitMap } from './art.mjs';
import { Ensemble } from './music.mjs';
import { INSTRUMENTS, MOVEMENTS, countInstrument, encoreRound, longBeats, movement, requirements } from './levels.mjs';

const $ = id => document.getElementById(id);
const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII'];
const SAVE_KEY = 'last-note.score.v1';
let raw;
try { raw = localStorage.getItem(SAVE_KEY); } catch { /* In private storage modes the current session still plays. */ }
let s = restore(raw);
const away = settleArchive(s);
const ensemble = new Ensemble();
ensemble.setVolume(s.volume);
ensemble.setMuted(s.muted);
const map = new OrbitMap($('routes'));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const guide = $('guide');
const sites = Object.fromEntries(Array.from(document.querySelectorAll('[data-site]'), e => [e.dataset.site, e]));
let placing = false, selectedType = 'bell', selectedSlot = 0, socketNodes = [], renderedMovement = 0;
let beatTimer = 0, lastBeat = performance.now(), nextBeat = 0, recentBell = {at: -1000, slot: 0};
let toastTimer = 0, frame = 0, resumeAfterGuide = false, lastScoreSignature = '';
let soundCheckFrame = 0, soundCheckEnd = 0, soundCheckPeak = 0;
const rows = [
  { label:'Tuning fork', tone:'#edc587', type:'fork' },
  { label:'Echo chamber', tone:'#bea5ed', type:'chamber' }
];
let lamps = [...$('beats').children];
for (let i = 0; i < TARGET_BARS; i++) $('bar-marks').append(document.createElement('i'));

function save() {
  try { localStorage.setItem(SAVE_KEY, serialize(s)); } catch { /* Storage is optional. */ }
}
function say(message) {
  $('toast').textContent = message;
  $('toast').classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('on'), 3400);
}
function updateIcon(element, name) {
  if (element.dataset.icon !== name) { element.dataset.icon = name; icon(element); }
}
function flash(element) {
  if (reduceMotion.matches) return;
  element.classList.remove('flash');
  void element.offsetWidth;
  element.classList.add('flash');
}
function renderSound() {
  let label = 'Enable sound';
  let detail = 'Enable sound to start the instruments.';
  if (s.muted || s.volume === 0) {
    label = 'Sound off';
    detail = 'Sound is muted. Play a test chime to enable it.';
  } else if (ensemble.audible) {
    label = 'Sound on';
    detail = 'Audio is ready.';
  } else if (['interrupted', 'suspended', 'closed'].includes(ensemble.state)) {
    label = 'Resume sound';
    detail = 'Audio is paused by the browser. Tap to resume sound.';
  } else if (ensemble.state === 'error') {
    label = 'Retry sound';
    detail = 'Audio could not start. Play a test chime to try again.';
  }
  $('sound-label').textContent = label;
  $('sound').setAttribute('aria-pressed', String(ensemble.audible));
  $('sound').title = ensemble.audible ? 'Mute the instruments' : 'Activate audio and play a chime';
  updateIcon($('sound').querySelector('canvas'), ensemble.audible ? 'sound' : 'muted');
  $('audio-status').textContent = detail;
  $('volume').value = Math.round(s.volume * 100);
  $('volume-value').textContent = Math.round(s.volume * 100) + '%';
}
async function enableSound() {
  if (s.muted) return false;
  const okay = await ensemble.unlock(false);
  renderSound();
  if (!okay) say('Audio needs activation. Use Enable sound, or try the sound check in Field guide.');
  return okay;
}
function measureSound(now) {
  const level = ensemble.outputLevel();
  soundCheckPeak = Math.max(soundCheckPeak, level);
  $('audio-level').value = Math.min(1, level * 5);
  $('audio-level').dataset.peak = soundCheckPeak.toFixed(6);
  if (now < soundCheckEnd && guide.open) {
    soundCheckFrame = requestAnimationFrame(measureSound);
    return;
  }
  soundCheckFrame = 0;
  $('audio-level').value = Math.min(1, soundCheckPeak * 5);
  $('audio-result').textContent = soundCheckPeak > .001
    ? 'Chime generated. If it is silent, check the browser tab and your device’s media volume.'
    : 'No output detected. Tap Play test chime to activate audio again.';
}
function activateSound() {
  s.muted = false;
  if (s.volume === 0) s.volume = .7;
  ensemble.setVolume(s.volume);
  return enableSound();
}
function testSound() {
  const activated = activateSound();
  $('audio-result').textContent = 'Starting the test chime…';
  $('audio-level').value = 0;
  $('audio-level').dataset.peak = '0';
  cancelAnimationFrame(soundCheckFrame);
  renderSound(); save();
  activated.then(ok => {
    if (!ok || s.muted) {
      $('audio-result').textContent = 'Audio did not start. Tap Play test chime to retry.';
      return;
    }
    ensemble.play([{ type: 'bell' }], keyIndex(s), false);
    $('audio-result').textContent = 'Playing a glass-bell chime…';
    soundCheckPeak = 0;
    soundCheckEnd = performance.now() + 1800;
    soundCheckFrame = requestAnimationFrame(measureSound);
  });
}
function events(list) {
  ensemble.play(list, keyIndex(s), s.muted);
  for (const e of list) {
    if (e.type === 'fork') flash(sites.fork);
    if (e.type === 'chamber') flash(sites.chamber);
    if (e.type === 'return') {
      const pop = $('payout-pop');
      pop.textContent = '+' + amount(e.value);
      pop.classList.remove('show');
      void pop.offsetWidth;
      pop.classList.add('show');
    }
    if (e.slot && socketNodes[e.slot - 1]) flash(socketNodes[e.slot - 1]);
    if (e.type === 'bell') recentBell = {at: performance.now(), slot: e.slot};
    if (e.type === 'fade') {
      say('The fork fell silent. Change the route or move the bell and try again.');
      $('announcement').textContent = 'The fork fell silent.';
    }
    if (e.type === 'rest') say('The rest has begun. Release the chord before the fork fades.');
  }
}
function objective() {
  if (s.status === 'faded') return ['The fork fell silent', 'Cover the three-beat gap with a bell, a pulse drum, or a staggered phrase, then rekindle the fork.'];
  if (s.resting) return ['Hold the silence', 'Each beat doubles the returning chord. A glass bell answers on beat three. Release before the fork fades.'];
  if (canRecord(s)) return ['Your phrase is ready', 'Record these eight bars to unlock the next movement.'];
  if (placing) return ['Place ' + INSTRUMENTS[selectedType].name.toLowerCase(),
    selectedSlot ? 'Choose another socket to move this instrument for free. Occupied sockets swap instruments.' : INSTRUMENTS[selectedType].description + ' Choose a socket on the map.'];
  if (s.movement > 1) return [s.circuit === 2 ? 'Arrange the next movement' :
    s.bars >= TARGET_BARS ? 'Complete the arrangement' : 'Keep eight bars ringing', movement(s).lesson];
  if (s.status === 'ready' && !s.resonance && !countInstrument(s,'bell')) return ['Wake the tuning fork', 'Strike the fork to send a note around the short circuit.'];
  if (s.circuit !== 2) return ['Keep eight bars ringing', 'A bell on beat two splits the four-beat journey into two safe gaps.'];
  if (countInstrument(s,'bell')) return ['Stretch the circuit', 'Switch to the four-beat route and listen for the bell’s answer.'];
  if (s.resonance >= instrumentCost(s,'bell')) return ['Place a glass bell', 'Choose a socket for the answering echo. A halfway chime divides a four-beat trip into two safe gaps.'];
  return ['Gather three resonance', 'Each short return brings one resonance toward your first glass bell.'];
}
function noteInScore(type, beat) {
  if (type === 'phrase') return phraseEvents(s,beat).length > 0;
  const phase = beat % s.circuit;
  if (type === 'fork') return phase === 0;
  if (type === 'chamber') return phase === s.circuit - 1;
  return instrumentNotes(s,beat).some(note=>note.type===type);
}
function renderMap() {
  if (renderedMovement === s.movement) return;
  renderedMovement = s.movement;
  const layout = circuitLayout(longBeats(s));
  $('sky').classList.toggle('extended',longBeats(s)>8);
  $('transport').classList.toggle('extended',longBeats(s)>8);
  const position = (node, p) => {
    node.style.setProperty('--x', p.x * 100 + '%');
    node.style.setProperty('--y', p.y * 100 + '%');
  };
  position(sites.fork,layout.fork); position(sites.chamber,layout.chamber);
  $('payout-pop').style.left=layout.fork.x*100+'%';
  $('payout-pop').style.top=layout.fork.y*100+'%';
  for(const node of socketNodes) node.remove();
  socketNodes=layout.slots.map((p,i)=>{
    const node=document.createElement('button');
    node.className='node socket';node.dataset.slot=i+1;
    node.innerHTML='<span class="orb"><canvas data-icon="plus" aria-hidden="true"></canvas></span><span class="node-label"></span>';
    position(node,p);node.addEventListener('click',()=>mount(i+1));
    $('field').append(node);return node;
  });
  $('instruments').replaceChildren();
  const next=Object.entries(INSTRUMENTS).find(([,v])=>v.unlock>s.movement)?.[0];
  for(const [type,definition] of Object.entries(INSTRUMENTS)) {
    if(definition.unlock>s.movement && type!==next)continue;
    const button=document.createElement('button');
    button.className='instrument';button.dataset.instrument=type;
    button.style.setProperty('--instrument-color',definition.color);
    button.disabled=s.movement<definition.unlock;
    button.innerHTML='<span class="tile-icon"><canvas aria-hidden="true"></canvas></span><span class="tile-text"><strong></strong><small></small></span><span class="price"></span>';
    button.querySelector('strong').textContent=definition.name;
    button.querySelector('canvas').dataset.icon=definition.icon;
    button.addEventListener('click',()=>{
      selectedType=type;selectedSlot=0;placing=true;render();
      say('Choose a socket for '+definition.name.toLowerCase()+'.');
    });
    $('instruments').append(button);
  }
  $('journey-progress').textContent=s.movement<=MOVEMENTS.length?s.movement+' / '+MOVEMENTS.length:'Encore '+encoreRound(s);
  $('journey-items').replaceChildren();
  MOVEMENTS.forEach((level,i)=>{
    const item=document.createElement('li');
    item.classList.toggle('completed',s.movement>i+1);item.classList.toggle('current',s.movement===i+1);
    const name=document.createElement('strong');name.textContent=(i+1)+'. '+level.title;
    const info=document.createElement('span');info.textContent=level.beats+' beats · '+(s.movement>i+1?'Recorded':s.movement===i+1?'Playing':'Upcoming');
    item.append(name,info);$('journey-items').append(item);
  });
  document.querySelectorAll('#instruments canvas,.node canvas').forEach(e=>icon(e));
  map.resize();
}
function renderInstruments() {
  for(const button of $('instruments').children) {
    const type=button.dataset.instrument,definition=INSTRUMENTS[type],count=countInstrument(s,type);
    const active=placing&&selectedType===type;
    button.classList.toggle('placing',active);
    button.setAttribute('aria-pressed',String(active));
    button.querySelector('small').textContent=button.disabled?'Unlocks in movement '+numerals[definition.unlock-1]:
      active&&selectedSlot?'Moving from beat '+selectedSlot:count?count+' mounted':'Choose a socket';
    button.querySelector('.price').textContent=button.disabled?'Locked':'✧ '+amount(instrumentCost(s,type));
  }
  socketNodes.forEach((node,i)=>{
    const type=s.slots[i],definition=INSTRUMENTS[type],selected=selectedSlot===i+1;
    node.classList.toggle('installed',!!type);node.classList.toggle('target',placing&&!selected);
    node.classList.toggle('selected-node',placing&&selected);
    node.style.setProperty('--node',definition?.color||'#9bb7b9');
    node.querySelector('.node-label').textContent=definition?definition.name+' · '+(i+1):'Socket '+numerals[i];
    node.setAttribute('aria-label',definition&&!placing?'Select '+definition.name+' at beat '+(i+1):
      'Place '+INSTRUMENTS[selectedType].name.toLowerCase()+' on socket '+(i+1)+', beat '+(i+1));
    updateIcon(node.querySelector('canvas'),definition?.icon||'plus');
  });
  $('instrument-help').textContent=placing?INSTRUMENTS[selectedType].description:
    'Select a card, then a socket. Select a placed instrument to move it for free.';
  $('remove-instrument').hidden=!selectedSlot||!placing;
  if(selectedSlot) $('remove-instrument').textContent='Remove · refund '+amount(instrumentCost(s,selectedType));
  const list=$('level-goals');list.replaceChildren();
  for(const goal of requirements(s)){
    const item=document.createElement('li');item.textContent=(goal.met?'✓ ':'○ ')+goal.label;
    item.classList.toggle('complete',goal.met);list.append(item);
  }
  list.hidden=!list.children.length;
}
function renderScore() {
  const columns=s.circuit===2?8:s.circuit*2, barLength=columns/2;
  const signature = [s.circuit,s.slots.join(','),s.movement,s.alignment].join('/');
  const score = $('score');
  if (signature !== lastScoreSignature) {
    lastScoreSignature = signature;
    score.replaceChildren();
    score.style.gridTemplateColumns='minmax(84px,1.55fr) repeat('+columns+',minmax(8px,1fr))';
    $('time-sign').textContent=barLength+'/4';
    score.append(document.createElement('span'));
    for (let j = 1; j <= columns; j++) {
      const head = document.createElement('span');
      head.className = 'score-colhead' + (j === barLength+1 ? ' bar-start' : '');
      head.textContent = String((j-1)%barLength+1); score.append(head);
    }
    const instruments=Object.entries(INSTRUMENTS).filter(([type])=>type==='bell'||countInstrument(s,type))
      .map(([type,v])=>({label:v.name,tone:v.color,type}));
    const tracks=[...rows,...instruments];
    if(s.voices.length)tracks.push({label:'Archive',tone:'#a1b9ef',type:'phrase'});
    for (const row of tracks) {
      const label = document.createElement('span');
      label.className = 'score-label';label.style.setProperty('--row',row.tone);
      label.append(document.createElement('i'), document.createTextNode(row.label));score.append(label);
      for (let j=1; j<=columns; j++) {
        const note = !!noteInScore(row.type,j);
        const cell=document.createElement('span');
        cell.className='cell'+(note?' note':'')+(j===barLength+1?' bar-start':'');
        cell.style.setProperty('--row',row.tone);cell.dataset.beat=j;
        cell.setAttribute('aria-label',row.label+', beat '+((j-1)%barLength+1)+(note?', note':', rest'));
        score.append(cell);
      }
    }
  }
  const col = s.beat ? (s.beat-1)%columns+1 : 0;
  for (const cell of score.querySelectorAll('.cell')) cell.classList.toggle('current', !s.resting && s.status !== 'faded' && +cell.dataset.beat === col);
}
function chosen(button, yes) {
  button.classList.toggle('selected',yes);
  button.setAttribute('aria-pressed',String(yes));
}
function render() {
  renderMap();
  $('movement').textContent=numerals[s.movement-1] || String(s.movement);
  $('movement-title').textContent=movement(s).title;
  $('resonance').textContent=amount(s.resonance);
  $('resonance').title=s.resonance.toString()+' resonance';
  $('recordings').textContent=String(s.movement-1);
  $('key').textContent=KEYS[keyIndex(s)]+' minor';
  renderSound();
  const running=s.status==='running', faded=s.status==='faded';
  $('sky').classList.toggle('silent',faded);
  [...$('sustain').children].forEach((v,i)=>v.classList.toggle('dim',i>=3-s.age));
  sites.fork.title = faded ? 'The fork has fallen silent' : 'Fork sustain · '+(3-s.age)+' of 3 beats';
  $('status').className='status'+(faded?' faded':running?' live':'');
  $('status').lastElementChild.textContent=s.resting && running?'Rest · '+s.restBeats:({ready:'Ready',paused:'Paused',running:'Ringing',faded:'Silent'})[s.status];
  const playLabel=({ready:'Strike the fork',paused:'Resume',running:'Pause',faded:'Rekindle the fork'})[s.status];
  $('play').querySelector('span').textContent=playLabel;
  updateIcon($('play').querySelector('canvas'),running?'pause':'play');
  $('tempo').querySelector('span').textContent=s.tempo+' BPM';
  const beats=s.circuit===2?4:s.circuit;
  if(lamps.length!==beats){$('beats').replaceChildren(...Array.from({length:beats},()=>document.createElement('i')));lamps=[...$('beats').children];}
  for(let j=0;j<beats;j++) lamps[j].classList.toggle('on',s.beat>0 && j===(s.beat-1)%beats && !faded);
  const [title,body]=objective();
  $('objective-title').textContent=title;$('objective-text').textContent=body;
  $('bar-progress').hidden=s.circuit===2;
  $('bar-count').textContent=s.bars+' / '+TARGET_BARS;
  [...$('bar-marks').children].forEach((e,i)=>e.classList.toggle('on',i<s.bars));
  chosen($('short'),s.circuit===2);chosen($('long'),s.circuit!==2);
  $('long').querySelector('small').textContent=longBeats(s)+' beats';
  $('return-value').textContent='+'+amount(payout(s))+' resonance';
  renderInstruments();
  $('archive-controls').hidden=!s.voices.length;
  if(s.voices.length){
    chosen($('stagger'),s.alignment==='stagger');chosen($('unison'),s.alignment==='unison');
    $('voice-hint').textContent=(s.alignment==='stagger'?'The archive is offset by two beats. ':'The archive doubles your long return. ')+'It earns '+amount(s.archiveYield)+' resonance per four beats.';
  }
  $('rest-controls').hidden=s.movement<3;
  $('rest').disabled=!running || s.circuit===2;
  $('rest').textContent=s.resting?'Release chord · ×'+(1n<<BigInt(s.restBeats)):s.restQueued?'Cancel queued rest':'Queue a rest';
  $('rest-hint').textContent=s.resting?'Release before the next three-beat gap.':'Hold the next long return. Each silent beat doubles its value.';
  $('record-controls').hidden=s.circuit===2;
  $('record').disabled=!canRecord(s)||s.resting;
  const recordIcon = $('record').querySelector('canvas');
  if (!$('record-controls').hidden && recordIcon.width === 300) icon(recordIcon);
  renderScore();
  if (!running) map.draw(s,0,performance.now(),recentBell);
}
function draw(now) {
  if(s.status!=='running' || document.hidden) {frame=0;return;}
  const duration=60000/s.tempo;
  if(!reduceMotion.matches) map.draw(s,(now-lastBeat)/duration,now,recentBell);
  frame=requestAnimationFrame(draw);
}
function drawOnce(){
  map.draw(s,0,performance.now(),recentBell);
  if(!frame && s.status==='running' && !reduceMotion.matches && !document.hidden) frame=requestAnimationFrame(draw);
}
function tick() {
  if(s.status!=='running' || document.hidden) return;
  const now=performance.now(), duration=60000/s.tempo;
  lastBeat=now; events(advance(s));settleArchive(s);render();save();drawOnce();
  if(s.status==='running') {
    nextBeat=Math.max(nextBeat+duration,now+duration*.65);
    beatTimer=setTimeout(tick,Math.max(1,nextBeat-performance.now()));
  }
}
function schedule(){
  clearTimeout(beatTimer);
  lastBeat=performance.now();nextBeat=lastBeat+60000/s.tempo;
  if(s.status==='running'&&!document.hidden) beatTimer=setTimeout(tick,60000/s.tempo);
  drawOnce();
}
function toggleTransport(){
  const was=s.status;
  const audio = was === 'running' ? null : enableSound();
  transport(s);render();schedule();save();
  audio?.then(ok=>{
    if(ok&&s.status==='running'&&was!=='paused')events([{type:'fork'}]);
  });
}
function changeLayout(change,message) {
  if(!change())return;
  placing=false;selectedSlot=0;render();schedule();save();
  if(message)say(message);
}
function mount(beat) {
  const existing=s.slots[beat-1];
  if(!placing&&existing){
    selectedType=existing;selectedSlot=beat;placing=true;render();
    say('Choose another socket to move '+INSTRUMENTS[existing].name.toLowerCase()+'.');return;
  }
  if(selectedSlot===beat){placing=false;selectedSlot=0;render();return;}
  const type=selectedType;
  if(!placeInstrument(s,type,beat,selectedSlot)){
    const refund=existing?instrumentCost(s,existing):0n;
    const needed=instrumentCost(s,type)-refund-s.resonance;
    say(needed>0n?'Earn '+amount(needed)+' more resonance to place this instrument.':'This instrument is already in that socket.');return;
  }
  placing=false;selectedSlot=0;render();schedule();save();
  say(INSTRUMENTS[type].name+' mounted at beat '+beat+'.');
  enableSound().then(ok=>{if(ok)ensemble.play([{type}],keyIndex(s),s.muted);});
}
$('play').addEventListener('click',toggleTransport);
sites.fork.addEventListener('click',toggleTransport);
sites.chamber.addEventListener('click',()=>{
  say('The chamber turns the note home. This circuit returns '+amount(payout(s))+' resonance.');
  enableSound().then(ok=>{if(ok)ensemble.play([{type:'chamber'}],keyIndex(s),s.muted);});
});
$('short').addEventListener('click',()=>changeLayout(()=>setCircuit(s,2),'Two-beat circuit selected.'));
$('long').addEventListener('click',()=>changeLayout(()=>setCircuit(s,longBeats(s)),longBeats(s)+'-beat circuit selected.'));
$('remove-instrument').addEventListener('click',()=>{
  changeLayout(()=>removeInstrument(s,selectedSlot),'Instrument removed and resonance refunded.');
});
$('stagger').addEventListener('click',()=>changeLayout(()=>align(s,'stagger'),'The recorded phrase now answers on beat two.'));
$('unison').addEventListener('click',()=>changeLayout(()=>align(s,'unison'),'The recorded phrase now joins the returning chord.'));
$('record').addEventListener('click',()=>{
  const oldKey=keyIndex(s);
  if(!record(s))return;
  ensemble.play([{type:'record'}],oldKey,s.muted);
  placing=false;selectedSlot=0;selectedType='bell';cosmos($('cosmos'),s.movement);render();schedule();save();
  say('Phrase recorded. It now plays inside movement '+(numerals[s.movement-1]||s.movement)+'.');
});
$('rest').addEventListener('click',()=>{
  const result=conductorRest(s);if(!result)return;
  if(result.type==='release'){events([result]);say('Chord released · ×'+result.multiplier+' · +'+amount(result.value)+' bonus resonance.');schedule();}
  if(result.type==='queued')say('Rest queued for the next long return.');
  render();save();
});
$('tempo').addEventListener('click',()=>{
  settleArchive(s);s.tempo=TEMPOS[(TEMPOS.indexOf(s.tempo)+1)%TEMPOS.length];
  s.archiveTime=Date.now();render();schedule();save();say('Tempo set to '+s.tempo+' BPM.');
});
function toggleSound(){
  if (ensemble.audible) {
    s.muted = true;
    ensemble.setMuted(true);
  } else {
    activateSound().then(ok=>{
      if(ok&&!s.muted) ensemble.play([{type:'bell'}],keyIndex(s),false);
    });
  }
  renderSound(); save();
}
$('sound').addEventListener('click',toggleSound);
$('test-sound').addEventListener('click',testSound);
$('volume').addEventListener('input',()=>{
  s.volume = Number($('volume').value) / 100;
  ensemble.setVolume(s.volume);
  if (s.volume > 0) {
    s.muted = false;
    void enableSound();
  }
  renderSound(); save();
});
ensemble.onstatechange = renderSound;
$('guide-open').addEventListener('click',()=>{
  resumeAfterGuide=s.status==='running';
  if(resumeAfterGuide){transport(s);schedule();render();save();}
  guide.showModal();guide.querySelectorAll('canvas').forEach(e=>icon(e));
});
$('confirm-new').addEventListener('click',()=>{
  const { muted, volume }=s;
  s=newScore();s.muted=muted;s.volume=volume;
  placing=false;selectedSlot=0;selectedType='bell';resumeAfterGuide=false;recentBell={at:-1000,slot:0};
  $('new-score').open=false;
  $('announcement').textContent='';
  $('payout-pop').classList.remove('show');
  guide.close();cosmos($('cosmos'),s.movement);render();schedule();save();
  say('A new score is ready.');
});
guide.querySelectorAll('.close,.close-guide').forEach(b=>b.addEventListener('click',()=>guide.close()));
guide.addEventListener('close',()=>{
  cancelAnimationFrame(soundCheckFrame);
  soundCheckFrame = 0;
  if (resumeAfterGuide) void enableSound();
  if(resumeAfterGuide&&!document.hidden&&s.status==='paused'){transport(s);render();schedule();save();}
  resumeAfterGuide=false;
});
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.repeat||guide.open)return;
  if(e.key.toLowerCase()==='m'){e.preventDefault();toggleSound();}
  if(e.code==='Space' && !e.target.closest('button,input,select,textarea')){e.preventDefault();toggleTransport();}
  if(e.key==='Escape'&&placing){placing=false;selectedSlot=0;render();}
});
function restPage(){
  if(s.status==='running')transport(s);
  settleArchive(s);clearTimeout(beatTimer);render();save();
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)restPage();
  else{settleArchive(s);render();save();}
});
window.addEventListener('pagehide',restPage);
window.addEventListener('storage',e=>{
  if(e.key!==SAVE_KEY || !e.newValue)return;
  s=restore(e.newValue);placing=false;selectedSlot=0;selectedType='bell';ensemble.setVolume(s.volume);ensemble.setMuted(s.muted);cosmos($('cosmos'),s.movement);render();schedule();
});
setInterval(()=>{
  if(document.hidden || s.status==='running' || !s.archiveYield)return;
  if(settleArchive(s)>0n){render();save();}
},1000);
let lastWidth=0,lastHeight=0;
function layout(){
  const w=$('sky').clientWidth,h=$('sky').clientHeight;
  if(w===lastWidth&&h===lastHeight)return;
  lastWidth=w;lastHeight=h;cosmos($('cosmos'),s.movement);map.resize();
  document.querySelectorAll('canvas[data-icon]').forEach(e=>icon(e));drawOnce();
}
new ResizeObserver(layout).observe($('sky'));
render();layout();save();
if(away>0n)say('Your recorded phrases earned '+amount(away)+' resonance while you were away.');
