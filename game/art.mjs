const TAU = Math.PI * 2;

const iconPaths = {
  brand: ['M8 4v11c0 5 3 8 8 10 5-2 8-5 8-10V4 M12 2v13c0 3 1 5 4 7 3-2 4-4 4-7V2 M16 8v23 M3 10v4m26-4v4 M10 29h12'],
  fork: ['M10 3v12a6 6 0 0 0 12 0V3 M13 3v12a3 3 0 0 0 6 0V3 M16 21v8 M13 30h6', 'M5 6c-1 3-1 6 0 9m22-9c1 3 1 6 0 9'],
  crystal: ['M16 2 27 15 16 30 5 15Z M16 2l-4 13 4 15 4-15Z M5 15h22 M2 21c4 3 17 1 25-5'],
  bell: ['M7 21c3-4 3-6 3.5-10A5.6 5.6 0 0 1 16 6a5.6 5.6 0 0 1 5.5 5c.5 4 1 6 3.5 10 M6 22q10 4 20 0 M13 26q3 5 6 0 M16 3v3 M14 9c-1.5 1-2 4-2 6'],
  book: ['M3 6c5-1 9 0 13 3 4-3 8-4 13-3v19c-5-1-9 0-13 3-4-3-8-4-13-3Z M16 9v19'],
  sound: ['M3 13h6l7-6v18l-7-6H3Z M21 11q5 5 0 10 M25 7q9 9 0 18'],
  muted: ['M3 13h6l7-6v18l-7-6H3Z M22 12l7 8m0-8-7 8'],
  spark: ['M16 2q1 11 13 14-12 2-13 14Q14 18 3 16 14 13 16 2Z M23 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z'],
  northstar: ['M16 1l3.4 11.5L30 16l-10.6 3.5L16 31l-3.4-11.5L2 16l10.6-3.5Z M7 6l3 3m12 14 3 3'],
  layers: ['M3 13 16 5l13 8-13 8Z M3 18l13 8 13-8 M3 23l13 7 13-7'],
  orbit: ['M5 23C-1 17 11 3 23 4s6 14-2 19S8 27 5 23Z M5 10c8-6 22 6 22 14', 'M15 17h2'],
  play: ['M8 4l19 12L8 28Z'],
  pause: ['M8 5h5v22H8Z M19 5h5v22h-5Z'],
  plus: ['M7 16h18 M16 7v18'],
  tempo: ['M6 27 13 4h5l8 23Z M9 22h13 M16 21l8-12'],
  score: ['M2 10h28M2 16h28M2 22h28 M11 19V5l12-2v13 M9 19q-5 0-5 4t7-1 M21 15q-5 0-5 4t7-1'],
  close: ['M7 7l18 18 M25 7 7 25'],
  record: ['M16 3a13 13 0 1 1-.1 0 M16 10a6 6 0 1 1-.1 0']
};

export function icon(canvas, name = canvas.dataset.icon) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d'), size = Math.min(canvas.width, canvas.height);
  c.translate((canvas.width - size) / 2, (canvas.height - size) / 2);
  c.scale(size / 32, size / 32);
  c.strokeStyle = c.fillStyle = getComputedStyle(canvas).color;
  c.lineWidth = name === 'brand' ? 1.3 : 1.65;
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const path of iconPaths[name] || []) {
    const p = new Path2D(path);
    if (name === 'play' || name === 'pause') c.fill(p); else c.stroke(p);
  }
}

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const rand = random(961);
const noise = Float32Array.from({ length: 256 * 256 }, () => rand());
function smooth(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let u = x - ix, v = y - iy;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const i = ((iy & 255) << 8), j = (((iy + 1) & 255) << 8), k = ix & 255, l = (ix + 1) & 255;
  const a = noise[i + k] * (1 - u) + noise[i + l] * u;
  const b = noise[j + k] * (1 - u) + noise[j + l] * u;
  return a * (1 - v) + b * v;
}
function cloud(x, y) {
  return smooth(x, y) * .52 + smooth(x * 2.08 + 7, y * 2.08) * .26 +
    smooth(x * 4.2, y * 4.2 + 16) * .14 + smooth(x * 9.1, y * 9.1) * .08;
}
function star(c, x, y, r, color) {
  c.fillStyle = color;
  c.beginPath(); c.moveTo(x, y-r); c.quadraticCurveTo(x+.1*r,y-.12*r,x+.68*r,y);
  c.quadraticCurveTo(x+.12*r,y+.08*r,x,y+r);
  c.quadraticCurveTo(x-.12*r,y+.10*r,x-.68*r,y);
  c.quadraticCurveTo(x-.10*r,y-.13*r,x,y-r); c.fill();
}

function configure(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, w, h };
}

export function cosmos(canvas, movement) {
  const {c,w,h} = configure(canvas);
  if (!w || !h) return;
  const texture = document.createElement('canvas');
  texture.width = Math.min(760, Math.ceil(w)); texture.height = Math.ceil(texture.width * h/w);
  const tc = texture.getContext('2d'), pixels = tc.createImageData(texture.width,texture.height);
  const seed = (movement - 1) % 43;
  for (let j=0;j<texture.height;j++) {
    const y=j/texture.height;
    for(let i=0;i<texture.width;i++) {
      const x=i/texture.width, k=(j*texture.width+i)*4;
      const warp=cloud(x*4.8+13+seed,y*3.7+4);
      const n=cloud(x*8+warp*3+seed, y*6+warp*4);
      const spine=.79-.62*x+.09*Math.sin(7*x+.4)+(warp-.5)*.46;
      const d=(y-spine)/.22, band=Math.exp(-d*d);
      const dust=Math.pow(Math.max(0,n-.21)*1.55,1.7)*band;
      const filament=Math.pow(Math.max(0,1-Math.abs(n-.53)*10),4)*band*.35;
      const edge=Math.max(0,1-1.8*((x-.5)**2+(y-.48)**2));
      const warm=Math.exp(-30*((x-.25)**2+(y-.68)**2));
      const grain=noise[((j&255)<<8)+(i&255)]*2;
      pixels.data[k]=10+6*edge+(51+29*warm)*dust+15*filament+grain;
      pixels.data[k+1]=15+6*edge+(27+10*warm)*dust+9*filament+grain;
      pixels.data[k+2]=26+9*edge+(66-22*warm)*dust+22*filament+grain;
      pixels.data[k+3]=255;
    }
  }
  tc.putImageData(pixels,0,0); c.drawImage(texture,0,0,w,h);
  const r=random(2534+seed);
  const stars = Math.round(w*h/330);
  for(let i=0;i<stars;i++) {
    const x=r()*w,y=r()*h,bright=r(),v=r(),radius=.23+1.25*Math.pow(bright,6);
    c.fillStyle=v<.22?'rgba(244,209,170,'+(.18+.64*bright)+')':'rgba(208,215,242,'+(.18+.66*bright)+')';
    c.beginPath();c.arc(x,y,radius,0,TAU);c.fill();
    if(bright>.99) star(c,x,y,2.5+r()*2.5,'rgba(235,230,224,.78)');
  }
  // Faint plotted constellations at the edges of the observatory.
  const groups=[[[.026,.37],[.073,.32],[.105,.365],[.092,.425]],[[.77,.095],[.815,.13],[.845,.088],[.909,.115]],[[.75,.84],[.80,.90],[.86,.85],[.91,.90]],[[.12,.82],[.16,.87],[.22,.82]]];
  c.lineWidth=.7;c.strokeStyle='rgba(171,184,212,.20)';
  for(const group of groups){c.beginPath();group.forEach(([x,y],i)=>i?c.lineTo(x*w,y*h):c.moveTo(x*w,y*h));c.stroke();for(const [x,y] of group)star(c,x*w,y*h,2.4,'#c4c3d0aa');}
}
const point = (x,y) => ({x,y});
const F=point(.18,.53), A=point(.35,.22), B=point(.64,.23), E=point(.81,.56);
const home=[E,point(.70,.92),point(.32,.96),F];
const short=[[F,point(.365,.40),point(.63,.42),E],home];
const long=[[F,point(.214,.407),point(.28,.26),A],[A,point(.44,.15),point(.56,.16),B],[B,point(.71,.277),point(.785,.43),E],home];
function at(segment,t,w,h) {
  const [a,b,c,d]=segment, u=1-t;
  return {x:w*(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x),y:h*(u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y)};
}
function trace(ctx,seg,w,h){
  const [a,b,c,d]=seg;ctx.moveTo(a.x*w,a.y*h);ctx.bezierCurveTo(b.x*w,b.y*h,c.x*w,c.y*h,d.x*w,d.y*h);
}

export class OrbitMap {
  constructor(canvas) { this.canvas=canvas; this.resize(); }
  resize() { Object.assign(this,configure(this.canvas)); }
  draw(s, fraction, now, recentBell) {
    const {c,w,h}=this;
    if(!w || !h) return;
    c.clearRect(0,0,w,h);
    const active=s.circuit===4?long:short, alt=s.circuit===4?short:long;
    // The engravings remain still so the moving signal reads at a glance.
    c.save();c.strokeStyle='rgba(176,181,205,.13)';c.lineWidth=.7;
    c.beginPath();c.ellipse(.5*w,.53*h,.388*w,.36*h,-.035,0,TAU);c.stroke();
    c.setLineDash([1,7]);c.beginPath();c.ellipse(.5*w,.53*h,.412*w,.40*h,-.035,0,TAU);c.stroke();c.restore();
    const rings=[[F,47,'230,189,125'],[E,43,'186,161,227']];
    for(const [p,r,clr] of rings){
      const radius=w<480?r*.75:r;
      c.strokeStyle='rgba('+clr+',.23)';c.lineWidth=.8;
      for(let i=0;i<36;i++){const a=i*TAU/36;const t=i%3===0?4:1.8;c.beginPath();c.moveTo(p.x*w+Math.cos(a)*(radius+t),p.y*h+Math.sin(a)*(radius+t));c.lineTo(p.x*w+Math.cos(a)*radius,p.y*h+Math.sin(a)*radius);c.stroke();}
    }
    c.lineWidth=1.15;c.strokeStyle='rgba(169,177,197,.48)';c.setLineDash([4,6]);
    c.beginPath();for(const seg of alt.slice(0,-1))trace(c,seg,w,h);c.stroke();c.setLineDash([]);
    const grad=c.createLinearGradient(F.x*w,0,E.x*w,0);
    const faded=s.status==='faded';grad.addColorStop(0,faded?'#79747a':'#f0c487');grad.addColorStop(.49,faded?'#85808b':'#c6afb1');grad.addColorStop(1,faded?'#837a91':'#b29ddf');
    for(const seg of active) {
      c.strokeStyle=grad;c.globalAlpha=.10;c.lineWidth=5;c.beginPath();trace(c,seg,w,h);c.stroke();
      c.globalAlpha=.84;c.lineWidth=1.5;c.beginPath();trace(c,seg,w,h);c.stroke();
      const p=at(seg,.58,w,h), q=at(seg,.59,w,h), a=Math.atan2(q.y-p.y,q.x-p.x);
      c.save();c.translate(p.x,p.y);c.rotate(a);c.strokeStyle=grad;c.lineWidth=1.15;c.beginPath();c.moveTo(-4,-2.7);c.lineTo(0,0);c.lineTo(-4,2.7);c.stroke();c.restore();
    }
    c.globalAlpha=1;
    if(s.bell && s.circuit===4) {
      const p=s.bell===2?B:A, back=[p,point(p.x-.06,p.y+.10),point(F.x+.09,F.y-.02),F];
      c.strokeStyle='#78b9b389';c.lineWidth=.85;c.setLineDash([2,5]);c.beginPath();trace(c,back,w,h);c.stroke();c.setLineDash([]);
      if(s.status==='running' && now-recentBell<390){const q=at(back,Math.max(0,(now-recentBell)/390),w,h);star(c,q.x,q.y,5,'#b8fff0');}
    }
    if(faded || s.resting) return;
    const t=s.status==='running'?Math.min(.999,Math.max(0,fraction)):0;
    const seg=active[s.phase], p=at(seg,t,w,h);
    // A short spindle of harmonics follows the travelling pulse.
    if(s.status==='running'){
      for(let i=0;i<14;i++){const tt=t-i*.009;if(tt<0)break;const q=at(seg,tt,w,h);c.fillStyle='rgba(248,213,160,'+(.44*(1-i/14))+')';c.beginPath();c.arc(q.x,q.y,2.7-i*.12,0,TAU);c.fill();}
      c.save();c.shadowBlur=13;c.shadowColor='#ffda9e';star(c,p.x,p.y,6,'#fff0c9');c.restore();
    } else {
      const q=at(active[0],.23,w,h);
      c.save();c.shadowBlur=10;c.shadowColor='#edd4a2';star(c,q.x,q.y,4,'#f6deb5');c.restore();
    }
  }
}
