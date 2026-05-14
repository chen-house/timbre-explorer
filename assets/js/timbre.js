/* ============================================
   音色页 — 互动音频与可视化
   ============================================ */

let ac = null;
function getAC() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

/* ============================================
   一、四种基础波形 — 持续播放 + 时域可视化
   ============================================ */
let waveState = {
  type: null,        // 当前播放的波形 ('sine'|'square'|'sawtooth'|'triangle')
  osc: null,
  gain: null,
  analyser: null,
  raf: null,
};

function stopWave() {
  if (!waveState.type) return;
  try { waveState.osc.stop(); } catch (e) {}
  try { waveState.gain.disconnect(); } catch (e) {}
  if (waveState.raf) cancelAnimationFrame(waveState.raf);
  waveState = { type: null, osc: null, gain: null, analyser: null, raf: null };

  document.querySelectorAll('.wave-card').forEach(c => c.classList.remove('playing'));
  drawWaveStatic('sine');  // 默认描态曲线
}

function toggleWave(type, btn) {
  if (waveState.type === type) {
    stopWave();
    return;
  }
  stopWave();
  // 互斥：停掉其他声源
  stopAllTimbre();

  const a = getAC();
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.value = 440;  // A4

  const gain = a.createGain();
  // 渐入避免咔哒；持续到用户停止
  gain.gain.setValueAtTime(0, a.currentTime);
  gain.gain.linearRampToValueAtTime(0.18, a.currentTime + 0.05);

  const analyser = a.createAnalyser();
  analyser.fftSize = 1024;

  osc.connect(analyser);
  analyser.connect(gain);
  gain.connect(a.destination);
  osc.start();

  waveState = { type, osc, gain, analyser, raf: null };
  const card = btn.closest('.wave-card');
  if (card) card.classList.add('playing');

  drawWaveLive();
}

function drawWaveLive() {
  const canvas = document.getElementById('wave-canvas');
  if (!canvas || !waveState.analyser) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  const buf = new Uint8Array(waveState.analyser.fftSize);
  const colorMap = {
    sine: '#E8A070', square: '#B294D8',
    sawtooth: '#6ED9AC', triangle: '#E8C770'
  };
  const color = colorMap[waveState.type] || '#D85A30';

  function loop() {
    waveState.analyser.getByteTimeDomainData(buf);
    ctx.fillStyle = '#0F0E0C';
    ctx.fillRect(0, 0, W, H);

    // 中线
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // 波形
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < buf.length; i++) {
      const x = (i / buf.length) * W;
      const y = (buf[i] / 128 - 1) * (H / 2 - 6) + H / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    waveState.raf = requestAnimationFrame(loop);
  }
  loop();
}

function drawWaveStatic(type) {
  const canvas = document.getElementById('wave-canvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  ctx.fillStyle = '#0F0E0C';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('点击上方任一波形开始播放', W / 2, H / 2);
}

/* ============================================
   二、五种音色合成 — 通用辅助
   ============================================ */
let timbreActive = [];      // 当前活跃节点（一次只允许一个声音）
let timbreActiveBtn = null;

function stopAllTimbre() {
  timbreActive.forEach(n => {
    try { if (n.stop) n.stop(0); } catch (e) {}
    try { n.disconnect(); } catch (e) {}
  });
  timbreActive = [];
  if (timbreActiveBtn) {
    timbreActiveBtn.classList.remove('playing');
    timbreActiveBtn = null;
  }
}

/* 通用：白噪声 / 粉噪声 buffer */
function noiseBuffer(ac, type, durSec) {
  const len = Math.floor(ac.sampleRate * (durSec || 1));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  if (type === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (type === 'pink') {
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    // brown
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

/* 通用：调度一个声音的"自动停止"按钮重置 */
function autoStop(btn, ms) {
  setTimeout(() => {
    if (timbreActiveBtn === btn) stopAllTimbre();
  }, ms);
}

/* ============================================
   playTimbre — 派发到各 synth
   ============================================ */
function playTimbre(name, btn) {
  // 同一个按钮再点 → 停止
  if (timbreActiveBtn === btn) {
    stopAllTimbre();
    return;
  }
  // 切到其他按钮 / 第一次播放
  stopAllTimbre();
  stopWave();    // 与波形演示互斥

  const ac = getAC();
  btn.classList.add('playing');
  timbreActiveBtn = btn;

  const fn = TIMBRE_SYNTHS[name];
  if (!fn) { stopAllTimbre(); return; }
  const dur = fn(ac);
  autoStop(btn, dur * 1000 + 100);
}

/* ============================================
   各音色 synth 函数 — 返回时长（秒）
   ============================================ */
const TIMBRE_SYNTHS = {
  /* ── 瞬态型 ── */
  kick(ac) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.setValueAtTime(150, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.08);
    g.gain.setValueAtTime(0.9, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
    osc.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 0.45);
    timbreActive.push(osc, g);
    return 0.5;
  },
  snare(ac) {
    const buf = noiseBuffer(ac, 'white', 0.3);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.7, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(); src.stop(ac.currentTime + 0.3);
    timbreActive.push(src, g);
    return 0.4;
  },
  hihat(ac) {
    const buf = noiseBuffer(ac, 'white', 0.15);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.4, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(); src.stop(ac.currentTime + 0.15);
    timbreActive.push(src, g);
    return 0.25;
  },
  pluck(ac) {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 330;
    const f = ac.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(500, ac.currentTime + 0.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.7);
    osc.connect(f); f.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 0.75);
    timbreActive.push(osc, g);
    return 0.85;
  },

  /* ── 持续型 ── */
  strings(ac) {
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 1500; filt.Q.value = 0.6;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.4);
    g.gain.setValueAtTime(0.18, ac.currentTime + 1.6);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 2.2);
    filt.connect(g); g.connect(ac.destination);

    // 两个微失谐的锯齿波 → 弦乐 ensemble 感
    [220, 220.6, 329.6, 330.4].forEach(freq => {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = freq;
      const sg = ac.createGain(); sg.gain.value = 0.25;
      osc.connect(sg); sg.connect(filt);
      osc.start(); osc.stop(ac.currentTime + 2.3);
      timbreActive.push(osc);
    });
    // Vibrato
    const lfo = ac.createOscillator(); lfo.frequency.value = 5;
    const lfoG = ac.createGain(); lfoG.gain.value = 2;
    lfo.connect(lfoG);
    timbreActive.forEach(o => { if (o.frequency) lfoG.connect(o.frequency); });
    lfo.start(); lfo.stop(ac.currentTime + 2.3);
    timbreActive.push(lfo, g);
    return 2.3;
  },
  organ(ac) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.16, ac.currentTime + 0.15);
    g.gain.setValueAtTime(0.16, ac.currentTime + 2.0);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 2.4);
    g.connect(ac.destination);
    [130.8, 261.6, 392, 523.2, 783.99].forEach((freq, i) => {
      const osc = ac.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq;
      const sg = ac.createGain(); sg.gain.value = 0.4 / (i + 1);
      osc.connect(sg); sg.connect(g);
      osc.start(); osc.stop(ac.currentTime + 2.45);
      timbreActive.push(osc);
    });
    timbreActive.push(g);
    return 2.5;
  },
  flute(ac) {
    const osc = ac.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 440;
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 2800;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.25, ac.currentTime + 0.18);
    g.gain.setValueAtTime(0.25, ac.currentTime + 1.6);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 2.0);
    // 加一点气息噪声
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuffer(ac, 'pink', 2.2);
    const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 4000;
    const ng = ac.createGain(); ng.gain.value = 0.04;
    noise.connect(nf); nf.connect(ng); ng.connect(g);
    osc.connect(filt); filt.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 2.1);
    noise.start(); noise.stop(ac.currentTime + 2.1);
    timbreActive.push(osc, noise, g);
    return 2.2;
  },

  /* ── 谐鸣型 ── */
  bell(ac) {
    // 钟声：几个不严格谐波的正弦衰减叠加
    const partials = [
      { f: 587.33, a: 0.4, decay: 2.5 },  // D5
      { f: 880,    a: 0.3, decay: 1.8 },
      { f: 1318.5, a: 0.2, decay: 1.2 },
      { f: 1760,   a: 0.12, decay: 0.8 },
      { f: 2349,   a: 0.08, decay: 0.5 },
    ];
    const master = ac.createGain(); master.gain.value = 0.7;
    master.connect(ac.destination);
    partials.forEach(p => {
      const osc = ac.createOscillator();
      osc.type = 'sine'; osc.frequency.value = p.f;
      const g = ac.createGain();
      g.gain.setValueAtTime(p.a, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + p.decay);
      osc.connect(g); g.connect(master);
      osc.start(); osc.stop(ac.currentTime + p.decay + 0.05);
      timbreActive.push(osc);
    });
    timbreActive.push(master);
    return 2.8;
  },
  marimba(ac) {
    // 马林巴：4 倍频不严格的窄泛音
    const partials = [
      { f: 392,  a: 0.5, decay: 0.9 },
      { f: 1568, a: 0.18, decay: 0.6 },
      { f: 2352, a: 0.10, decay: 0.4 },
    ];
    const master = ac.createGain(); master.gain.value = 0.7;
    master.connect(ac.destination);
    partials.forEach(p => {
      const osc = ac.createOscillator();
      osc.type = 'sine'; osc.frequency.value = p.f;
      const g = ac.createGain();
      g.gain.setValueAtTime(p.a, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + p.decay);
      osc.connect(g); g.connect(master);
      osc.start(); osc.stop(ac.currentTime + p.decay + 0.05);
      timbreActive.push(osc);
    });
    timbreActive.push(master);
    return 1.2;
  },
  temple(ac) {
    // 寺庙钟：低频 + 长衰减 + 微微失谐拍频
    const partials = [
      { f: 196,   a: 0.55, decay: 4.5 },
      { f: 197.5, a: 0.45, decay: 4.0 },
      { f: 440,   a: 0.18, decay: 2.5 },
      { f: 880,   a: 0.10, decay: 1.5 },
    ];
    const master = ac.createGain(); master.gain.value = 0.6;
    master.connect(ac.destination);
    partials.forEach(p => {
      const osc = ac.createOscillator();
      osc.type = 'sine'; osc.frequency.value = p.f;
      const g = ac.createGain();
      g.gain.setValueAtTime(p.a, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + p.decay);
      osc.connect(g); g.connect(master);
      osc.start(); osc.stop(ac.currentTime + p.decay + 0.05);
      timbreActive.push(osc);
    });
    timbreActive.push(master);
    return 4.7;
  },

  /* ── 质感型 ── */
  white(ac) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 'white', 2.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ac.currentTime + 0.1);
    g.gain.setValueAtTime(0.12, ac.currentTime + 2.0);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 2.4);
    src.connect(g); g.connect(ac.destination);
    src.start(); src.stop(ac.currentTime + 2.45);
    timbreActive.push(src, g);
    return 2.5;
  },
  pink(ac) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 'pink', 2.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.16, ac.currentTime + 0.1);
    g.gain.setValueAtTime(0.16, ac.currentTime + 2.0);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 2.4);
    src.connect(g); g.connect(ac.destination);
    src.start(); src.stop(ac.currentTime + 2.45);
    timbreActive.push(src, g);
    return 2.5;
  },
  wind(ac) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 'pink', 3);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 480; f.Q.value = 0.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.4);
    g.gain.setValueAtTime(0.18, ac.currentTime + 2.5);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 3.0);
    // 缓慢的振幅 LFO 模拟风强度变化
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.4;
    const lfoG = ac.createGain(); lfoG.gain.value = 0.04;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(); src.stop(ac.currentTime + 3.05);
    lfo.start(); lfo.stop(ac.currentTime + 3.05);
    timbreActive.push(src, lfo, g);
    return 3.1;
  },

  /* ── 调制型 ── */
  vibrato(ac) {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 330;
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 1600;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.15);
    g.gain.setValueAtTime(0.22, ac.currentTime + 2.0);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 2.4);
    // LFO 调制频率
    const lfo = ac.createOscillator(); lfo.frequency.value = 5.5;
    const lfoG = ac.createGain(); lfoG.gain.value = 10; // ±10Hz
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    osc.connect(filt); filt.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 2.45);
    lfo.start(); lfo.stop(ac.currentTime + 2.45);
    timbreActive.push(osc, lfo, g);
    return 2.5;
  },
  wobble(ac) {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 110;
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 600; filt.Q.value = 8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.05);
    g.gain.setValueAtTime(0.22, ac.currentTime + 2.5);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 2.8);
    // LFO 调制滤波器截止频率（Wobble 核心）
    const lfo = ac.createOscillator(); lfo.frequency.value = 4;
    const lfoG = ac.createGain(); lfoG.gain.value = 800;
    const lfoOff = ac.createConstantSource(); lfoOff.offset.value = 900;
    lfo.connect(lfoG); lfoG.connect(filt.frequency);
    lfoOff.connect(filt.frequency);
    osc.connect(filt); filt.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 2.85);
    lfo.start(); lfo.stop(ac.currentTime + 2.85);
    lfoOff.start(); lfoOff.stop(ac.currentTime + 2.85);
    timbreActive.push(osc, lfo, lfoOff, g);
    return 2.9;
  },
  tremolo(ac) {
    const osc = ac.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 440;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.1);
    g.gain.setValueAtTime(0.22, ac.currentTime + 2.0);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + 2.4);
    // LFO 调制振幅
    const lfo = ac.createOscillator(); lfo.frequency.value = 7;
    const lfoG = ac.createGain(); lfoG.gain.value = 0.15;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    osc.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 2.45);
    lfo.start(); lfo.stop(ac.currentTime + 2.45);
    timbreActive.push(osc, lfo, g);
    return 2.5;
  },
};

/* ============================================
   TOC 自动生成 — 与 EQ 页一致
   ============================================ */
function buildTOC() {
  const list = document.getElementById('toc-list');
  if (!list) return;
  const sections = document.querySelectorAll('.container > section');
  let idx = 0;
  sections.forEach(sec => {
    const h2 = sec.querySelector('h2');
    if (!h2) return;
    idx += 1;
    if (!sec.id) sec.id = 'tsec-' + idx;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + sec.id;
    a.innerHTML = `<span class="toc-num">${String(idx).padStart(2, '0')}</span><span>${h2.textContent.trim()}</span>`;
    li.appendChild(a);
    list.appendChild(li);
  });
}

/* ============================================
   初始化
   ============================================ */
window.addEventListener('DOMContentLoaded', () => {
  buildTOC();
  setTimeout(() => drawWaveStatic('sine'), 50);
  window.addEventListener('resize', () => {
    if (!waveState.type) drawWaveStatic('sine');
  });
});
