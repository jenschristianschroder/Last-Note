import { TARGET_BARS, TEMPOS, KEYS, advance, align, amount, bellCost, canRecord, conductorRest, keyIndex,
  payout, placeBell, record, restore, serialize, setCircuit, settleArchive, transport } from './engine.mjs';
import { cosmos, icon, OrbitMap } from './art.mjs';
import { Ensemble } from './music.mjs';

const $ = id => document.getElementById(id);
const names = ['The First Echo', 'Counterpoint', 'The Conductor’s Rest', 'A Glass Horizon', 'The Far Octave', 'An Ocean of Bells'];
const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const SAVE_KEY = 'last-note.score.v1';
let raw;
try { raw = localStorage.getItem(SAVE_KEY); } catch { /* In private storage modes the current session still plays. */ }
let s = restore(raw);
const away = settleArchive(s);
const ensemble = new Ensemble();
const map = new OrbitMap($('routes'));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const guide = $('guide');
const sites = Object.fromEntries(Array.from(document.querySelectorAll('[data-site]'), e => [e.dataset.site, e]));
let placing = false, beatTimer = 0, lastBeat = performance.now(), nextBeat = 0, recentBell = -1000;
let toastTimer = 0, frame = 0, resumeAfterGuide = false, audioNoticeShown = false, lastScoreSignature = '';
const rows = [
  { label:'Tuning fork', tone:'#edc587', type:'fork' },
  { label:'Echo chamber', tone:'#bea5ed', type:'chamber' },
  { label:'Glass bell', tone:'#89d7ca', type:'bell' }
];
const lamps = [...$('beats').children];
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
async function enableSound() {
  if (s.muted) return false;
  const okay = await ensemble.unlock(false);
  if (!okay && !audioNoticeShown) {
    audioNoticeShown = true;
    say('Audio is unavailable here. The map and live score show every note.');
  }
  return okay;
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
    if (e.type === 'bell') { recentBell = performance.now(); flash(s.bell === 1 ? sites.one : sites.two); }
    if (e.type === 'fade') {
      say('The fork fell silent. Change the route or move the bell and try again.');
      $('announcement').textContent = 'The fork fell silent.';
    }
    if (e.type === 'rest') say('The rest has begun. Release the chord before the fork fades.');
  }
}
function objective() {
  if (s.status === 'faded') return ['The fork fell silent', 'A three-beat gap broke the sound. Try Socket II or the short circuit, then rekindle the fork.'];
  if (s.resting) return ['Hold the silence', 'Each beat doubles the returning chord. Release it before three beats pass without an echo.'];
  if (canRecord(s)) return ['Your phrase is ready', 'Record these eight bars to hear them inside the next movement.'];
  if (s.status === 'ready' && s.circuit === 2 && s.movement === 1 && !s.resonance && !s.bell) return ['Wake the tuning fork', 'Strike the fork to send a note around the short circuit.'];
  if (placing) return ['Choose a bell socket', 'Tap a socket on the map. The bell will answer on that beat of the long circuit.'];
  if (s.circuit === 4) {
    if (!(s.bell === 2 || (s.voices.length && s.alignment === 'stagger'))) return ['Find the missing echo', 'The fork needs an answer before beat three. Move the bell or earn one on the short circuit.'];
    return ['Keep eight bars ringing', 'Each clean four-beat return adds a bar. Hold this arrangement to record the phrase.'];
  }
  if (s.voices.length) return ['Bring in the next voice', 'Try the long circuit. Your recorded phrase can sustain beat two in stagger, or double a return in unison.'];
  if (s.bell) return ['Stretch the circuit', 'Switch to the four-beat route and listen for the bell’s answer.'];
  if (s.resonance >= bellCost(s)) return ['Place a glass bell', 'Choose a socket for the answering echo. A halfway chime divides a four-beat trip into two safe gaps.'];
  return ['Gather three resonance', 'Keep the short circuit ringing. Each return brings one resonance toward your first glass bell.'];
}
function noteInScore(type, beat) {
  if (type === 'phrase') {
    const phase = (beat + (s.alignment === 'stagger' ? 2 : 0)) % 4;
    return s.voices.some(voice => voice.pattern[phase]);
  }
  const phase = beat % s.circuit;
  if (type === 'fork') return phase === 0;
  if (type === 'chamber') return phase === s.circuit - 1;
  return s.circuit === 4 && s.bell !== 0 && phase === s.bell;
}
function renderScore() {
  const signature = [s.circuit,s.bell,s.movement,s.alignment].join('/');
  const score = $('score');
  if (signature !== lastScoreSignature) {
    lastScoreSignature = signature;
    score.replaceChildren();
    score.append(document.createElement('span'));
    for (let j = 1; j <= 8; j++) {
      const head = document.createElement('span');
      head.className = 'score-colhead' + (j === 5 ? ' bar-start' : '');
      head.textContent = String((j-1)%4+1); score.append(head);
    }
    const tracks = s.voices.length ? [...rows,{label:'Archive',tone:'#a1b9ef',type:'phrase'}] : rows;
    for (const row of tracks) {
      const label = document.createElement('span');
      label.className = 'score-label';label.style.setProperty('--row',row.tone);
      label.append(document.createElement('i'), document.createTextNode(row.label));score.append(label);
      for (let j=1; j<=8; j++) {
        const note = !!noteInScore(row.type,j);
        const cell=document.createElement('span');
        cell.className='cell'+(note?' note':'')+(j===5?' bar-start':'');
        cell.style.setProperty('--row',row.tone);cell.dataset.beat=j;
        cell.setAttribute('aria-label',row.label+', beat '+((j-1)%4+1)+(note?', note':', rest'));
        score.append(cell);
      }
    }
  }
  const col = s.beat ? (s.beat-1)%8+1 : 0;
  for (const cell of score.querySelectorAll('.cell')) cell.classList.toggle('current', !s.resting && s.status !== 'faded' && +cell.dataset.beat === col);
}
function chosen(button, yes) {
  button.classList.toggle('selected',yes);
  button.setAttribute('aria-pressed',String(yes));
}
function render() {
  $('movement').textContent=numerals[s.movement-1] || String(s.movement);
  $('movement-title').textContent=names[(s.movement-1)%names.length];
  $('resonance').textContent=amount(s.resonance);
  $('resonance').title=s.resonance.toString()+' resonance';
  $('recordings').textContent=String(s.movement-1);
  $('key').textContent=KEYS[keyIndex(s)]+' minor';
  $('sound-label').textContent=s.muted?'Sound off':'Sound on';
  $('sound').setAttribute('aria-pressed',String(!s.muted));
  updateIcon($('sound').querySelector('canvas'),s.muted?'muted':'sound');
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
  for(let j=0;j<4;j++) lamps[j].classList.toggle('on',s.beat>0 && j===(s.beat-1)%4 && !faded);
  const [title,body]=objective();
  $('objective-title').textContent=title;$('objective-text').textContent=body;
  $('bar-progress').hidden=s.circuit!==4;
  $('bar-count').textContent=s.bars+' / '+TARGET_BARS;
  [...$('bar-marks').children].forEach((e,i)=>e.classList.toggle('on',i<s.bars));
  chosen($('short'),s.circuit===2);chosen($('long'),s.circuit===4);
  $('return-value').textContent='+'+amount(payout(s))+' resonance';
  $('bell').classList.toggle('placing',placing);
  $('bell').setAttribute('aria-pressed',String(placing));
  $('bell-sub').textContent=placing?'Choose a socket':s.bell?'Mounted on beat '+s.bell:'Place an answering echo';
  $('bell-price').textContent=s.bell?'Move':'✧ '+amount(bellCost(s));
  $('instrument-help').textContent=s.bell?'Move the bell between sockets for free. Moving restarts the phrase.':'The bell sends an echo back to the fork from its socket.';
  [sites.one,sites.two].forEach((node,i)=>{
    const installed=s.bell===i+1;
    node.classList.toggle('installed',installed);node.classList.toggle('target',placing);
    node.querySelector('.node-label').textContent=installed?'Glass bell':i===0?'Socket I':'Socket II';
    node.setAttribute('aria-label',(installed?'Glass bell at':'Place glass bell on')+' socket '+(i+1)+', beat '+(i+1));
    updateIcon(node.querySelector('canvas'),installed?'bell':'plus');
  });
  $('archive-controls').hidden=!s.voices.length;
  if(s.voices.length){
    chosen($('stagger'),s.alignment==='stagger');chosen($('unison'),s.alignment==='unison');
    $('voice-hint').textContent=(s.alignment==='stagger'?'The archive answers on beat two. ':'The archive doubles your long return. ')+'It earns '+amount(s.archiveYield)+' resonance per bar.';
  }
  $('rest-controls').hidden=s.movement<3;
  $('rest').disabled=!running || s.circuit!==4;
  $('rest').textContent=s.resting?'Release chord · ×'+(1n<<BigInt(s.restBeats)):s.restQueued?'Cancel queued rest':'Queue a rest';
  $('rest-hint').textContent=s.resting?'Release before the next three-beat gap.':'Hold the next long return. Each silent beat doubles its value.';
  $('record-controls').hidden=s.circuit!==4;
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
  transport(s);render();schedule();save();
  if(s.status==='running') {
    enableSound().then(ok=>{
      if(ok&&s.status==='running'&&was!=='paused')events([{type:'fork'}]);
    });
  }
}
function changeLayout(change,message) {
  if(!change())return;
  placing=false;render();schedule();save();
  if(message)say(message);
}
function mount(n) {
  if(s.bell===n){placing=false;render();say('The glass bell is mounted on beat '+n+'.');return;}
  if(!s.bell && s.resonance<bellCost(s)){say('A glass bell costs '+amount(bellCost(s))+' resonance. Play the short circuit to earn it.');return;}
  changeLayout(()=>placeBell(s,n),'Glass bell mounted on beat '+n+'.');
  enableSound().then(ok=>{if(ok)ensemble.play([{type:'bell'}],keyIndex(s),s.muted);});
}
$('play').addEventListener('click',toggleTransport);
sites.fork.addEventListener('click',toggleTransport);
sites.chamber.addEventListener('click',()=>{
  say('The chamber turns the note home. This circuit returns '+amount(payout(s))+' resonance.');
  enableSound().then(ok=>{if(ok)ensemble.play([{type:'chamber'}],keyIndex(s),s.muted);});
});
sites.one.addEventListener('click',()=>mount(1));
sites.two.addEventListener('click',()=>mount(2));
$('short').addEventListener('click',()=>changeLayout(()=>setCircuit(s,2),'Two-beat circuit selected.'));
$('long').addEventListener('click',()=>changeLayout(()=>setCircuit(s,4),'Four-beat circuit selected.'));
$('bell').addEventListener('click',()=>{
  if(!s.bell && s.resonance<bellCost(s)){say('Earn '+amount(bellCost(s)-s.resonance)+' more resonance on the short circuit.');return;}
  placing=!placing;render();
  if(placing){say('Choose Socket I or Socket II on the circuit map.');sites.two.focus();}
});
$('stagger').addEventListener('click',()=>changeLayout(()=>align(s,'stagger'),'The recorded phrase now answers on beat two.'));
$('unison').addEventListener('click',()=>changeLayout(()=>align(s,'unison'),'The recorded phrase now joins the returning chord.'));
$('record').addEventListener('click',()=>{
  const oldKey=keyIndex(s);
  if(!record(s))return;
  ensemble.play([{type:'record'}],oldKey,s.muted);
  placing=false;cosmos($('cosmos'),s.movement);render();schedule();save();
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
  s.muted=!s.muted;ensemble.setMuted(s.muted);
  if(!s.muted)enableSound().then(ok=>{if(ok&&s.status!=='running')ensemble.play([{type:'bell'}],keyIndex(s),s.muted);});
  render();save();
}
$('sound').addEventListener('click',toggleSound);
$('guide-open').addEventListener('click',()=>{
  resumeAfterGuide=s.status==='running';
  if(resumeAfterGuide){transport(s);schedule();render();save();}
  guide.showModal();guide.querySelectorAll('canvas').forEach(e=>icon(e));
});
guide.querySelectorAll('.close,.close-guide').forEach(b=>b.addEventListener('click',()=>guide.close()));
guide.addEventListener('close',()=>{
  if(resumeAfterGuide&&!document.hidden&&s.status==='paused'){transport(s);render();schedule();save();}
  resumeAfterGuide=false;
});
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.repeat||guide.open)return;
  if(e.key.toLowerCase()==='m'){e.preventDefault();toggleSound();}
  if(e.code==='Space' && !e.target.closest('button,input,select,textarea')){e.preventDefault();toggleTransport();}
  if(e.key==='Escape'&&placing){placing=false;render();}
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
  s=restore(e.newValue);placing=false;ensemble.setMuted(s.muted);cosmos($('cosmos'),s.movement);render();schedule();
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
