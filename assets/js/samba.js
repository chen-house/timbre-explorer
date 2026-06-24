/* ============================================
   桑巴乐队 bateria · Web Audio 实时合成
   8 件打击乐声部由参数驱动实时生成，不依赖音频文件。
   标注「合成近似」的声部（cuíca 摩擦鼓 / reco-reco 刮器 / agogô 金属）
   含复杂摩擦或不和谐金属泛音，简单合成只能教学性近似。
   核心：底部「合奏台」是一个可逐层开关的循环序列器，
   让你亲耳听见 低(surdo) → 中(caixa/repinique) → 高(其余)
   是怎么一层层叠成一支桑巴的。
   ============================================ */

let _ctx = null;
let _master = null;
let _noiseBuf = null;

function ac() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _master = _ctx.createGain();
    _master.gain.value = 0.85;
    _master.connect(_ctx.destination);
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function noiseBuf(ctx) {
  if (_noiseBuf) return _noiseBuf;
  const n = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  _noiseBuf = b;
  return b;
}
function noiseSrc(ctx) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  s.loop = true;
  return s;
}

/* ---------- 基础发声块（与 drums.js 同源） ---------- */

// 膜鼓音：正弦基频带音高包络
function membrane(ctx, t, out, { f0, f1, dec, gain = 1, type = 'sine' }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 0.0001), t + dec * 0.85);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dec + 0.05);
}

// 噪声击：滤波后短噪声（敲击、响弦、沙锤、刮擦）
function noiseHit(ctx, t, out, { type = 'highpass', freq = 4000, Q = 0.7, gain = 0.5, dec = 0.05, attack = 0.001 }) {
  const n = noiseSrc(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  n.connect(f).connect(g).connect(out);
  n.start(t);
  n.stop(t + dec + 0.05);
}

// 钟铃音（agogô）：少数正弦泛音快速衰减
function bell(ctx, t, out, { freq, dec = 0.4, gain = 0.16 }) {
  const ratios = [1, 2.0, 2.99];
  const rg = [1, 0.4, 0.18];
  ratios.forEach((r, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * r;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * rg[i], t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec * (1 - i * 0.18));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dec + 0.05);
  });
}

// cuíca 摩擦鼓「呜-呃」：锯齿音高滑动经带通 —— 合成近似
function cuicaCry(ctx, t, out, { f0, f1, dec = 0.22, gain = 0.22 }) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f1, t + dec * 0.8);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 680;
  bp.Q.value = 3.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  o.connect(bp).connect(g).connect(out);
  o.start(t);
  o.stop(t + dec + 0.05);
}

// reco-reco 刮器：一串极短颗粒噪声模拟「咔啦」刮擦 —— 合成近似
function recoScrape(ctx, t, out) {
  for (let i = 0; i < 6; i++) {
    noiseHit(ctx, t + i * 0.013, out, { type: 'bandpass', freq: 3000, Q: 1.3, gain: 0.11, dec: 0.012 });
  }
}

/* ---------- 各声部单击合成 ---------- */
const HIT = {
  // 低音：surdo 大鼓 —— 开音(o) / 闷音(m)
  surdoOpen(ctx, t, out) {
    membrane(ctx, t, out, { f0: 96, f1: 54, dec: 0.5, gain: 1 });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 1500, gain: 0.14, dec: 0.012 });
  },
  surdoMute(ctx, t, out) {
    membrane(ctx, t, out, { f0: 90, f1: 64, dec: 0.13, gain: 0.55 });
  },
  // 中音：caixa 响弦鼓 —— 普通(c) / 重音(a)
  caixa(ctx, t, out) {
    membrane(ctx, t, out, { f0: 250, f1: 230, dec: 0.04, gain: 0.12, type: 'triangle' });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 2000, Q: 0.7, gain: 0.26, dec: 0.035 });
  },
  caixaAccent(ctx, t, out) {
    membrane(ctx, t, out, { f0: 250, f1: 225, dec: 0.05, gain: 0.16, type: 'triangle' });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 1800, Q: 0.7, gain: 0.5, dec: 0.06 });
  },
  // 中音：repinique 领奏鼓 —— 尖锐穿透
  repique(ctx, t, out) {
    membrane(ctx, t, out, { f0: 420, f1: 300, dec: 0.10, gain: 0.5, type: 'triangle' });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 2600, gain: 0.35, dec: 0.05 });
  },
  // 高音：tamborim 手鼓 —— 极短「嗒」
  tamborim(ctx, t, out) {
    membrane(ctx, t, out, { f0: 470, f1: 430, dec: 0.04, gain: 0.32, type: 'triangle' });
    noiseHit(ctx, t, out, { type: 'highpass', freq: 4500, gain: 0.3, dec: 0.03 });
  },
  // 高音：chocalho 摇铃 —— 沙锤「唰」
  chocalho(ctx, t, out) {
    noiseHit(ctx, t, out, { type: 'highpass', freq: 6500, Q: 0.6, gain: 0.2, dec: 0.045 });
  },
  // 高音：agogô 双音铃 —— 高(h) / 低(l)
  agogoHi(ctx, t, out) { bell(ctx, t, out, { freq: 900, dec: 0.32, gain: 0.15 }); },
  agogoLo(ctx, t, out) { bell(ctx, t, out, { freq: 680, dec: 0.38, gain: 0.16 }); },
  // 高音：cuíca 摩擦鼓 —— 升(u) / 降(d)
  cuicaUp(ctx, t, out)   { cuicaCry(ctx, t, out, { f0: 260, f1: 540, dec: 0.2 }); },
  cuicaDown(ctx, t, out) { cuicaCry(ctx, t, out, { f0: 540, f1: 250, dec: 0.22 }); },
  // 高音：reco-reco 刮器
  reco(ctx, t, out) { recoScrape(ctx, t, out); },
};

/* ---------- 单卡片短乐句（一键听出声部性格） ---------- */
function shaker(name, count, step) {
  const out = [];
  for (let i = 0; i < count; i++) out.push([i * step, name]);
  return out;
}

const CARD = {
  surdo:     [[0, 'surdoMute'], [0.45, 'surdoOpen'], [0.9, 'surdoMute'], [1.35, 'surdoOpen']],
  caixa:     (() => { const a = shaker('caixa', 12, 0.12); [3, 7, 11].forEach(i => a[i] && (a[i][1] = 'caixaAccent')); return a; })(),
  repinique: [[0, 'repique'], [0.16, 'repique'], [0.32, 'repique'], [0.5, 'repique'], [0.74, 'repique']],
  tamborim:  [[0, 'tamborim'], [0.2, 'tamborim'], [0.3, 'tamborim'], [0.5, 'tamborim'], [0.6, 'tamborim'], [0.8, 'tamborim'], [1.0, 'tamborim']],
  chocalho:  shaker('chocalho', 14, 0.1),
  agogo:     [[0, 'agogoLo'], [0.2, 'agogoHi'], [0.35, 'agogoHi'], [0.6, 'agogoLo'], [0.8, 'agogoHi'], [0.95, 'agogoHi'], [1.15, 'agogoLo']],
  cuica:     [[0, 'cuicaUp'], [0.32, 'cuicaDown'], [0.72, 'cuicaUp'], [1.04, 'cuicaDown']],
  reco:      [[0, 'reco'], [0.35, 'reco'], [0.7, 'reco'], [1.05, 'reco']],
};

const _timers = [];

function playSamba(name, btn) {
  const ctx = ac();
  const phrase = CARD[name];
  if (!phrase) return;
  const t0 = ctx.currentTime + 0.04;
  phrase.forEach(([off, fn]) => { if (HIT[fn]) HIT[fn](ctx, t0 + off, _master); });
  if (btn) {
    const last = phrase[phrase.length - 1][0];
    btn.classList.add('playing');
    const id = setTimeout(() => btn.classList.remove('playing'), Math.min((last + 0.4) * 1000, 2200));
    _timers.push(id);
  }
}

/* ============================================
   合奏台：16 步循环序列器（一小节 4/4，桑巴感觉在 2）
   每个声部一行 16 格；可逐层静音，听低/中/高如何叠加。
   ============================================ */

// 每声部 16 步图案：键=步号(0..15)，值=发声代码
const PATTERN = {
  // surdo：锚在拍 2、拍 4 的重开音(o)，前面 16 分垫一记闷音(m) —— 桑巴的「in 2」心跳
  surdo:     { 3: 'm', 4: 'o', 11: 'm', 12: 'o' },
  // caixa：连续 16 分铺底，'a' 的位置(每拍最后一个 16 分)给重音
  caixa:     { 0:'c',1:'c',2:'c',3:'a',4:'c',5:'c',6:'c',7:'a',8:'c',9:'c',10:'c',11:'a',12:'c',13:'c',14:'c',15:'a' },
  // repinique：稀疏领奏 + 句尾小过门
  repinique: { 0: 'x', 7: 'x', 14: 'x', 15: 'x' },
  // tamborim：teleco-teco 切分，高频咬住反拍
  tamborim:  { 0: 'x', 3: 'x', 4: 'x', 7: 'x', 8: 'x', 11: 'x', 14: 'x' },
  // chocalho：整排 16 分摇，制造摇摆 wash
  chocalho:  { 0:'x',1:'x',2:'x',3:'x',4:'x',5:'x',6:'x',7:'x',8:'x',9:'x',10:'x',11:'x',12:'x',13:'x',14:'x',15:'x' },
  // agogô：高低铃交替的固定音型
  agogo:     { 0: 'l', 2: 'h', 3: 'h', 6: 'l', 8: 'h', 10: 'h', 11: 'h', 14: 'l' },
  // cuíca：即兴「呜呃」点缀在反拍
  cuica:     { 4: 'u', 6: 'd', 12: 'u', 14: 'd' },
  // reco-reco：刮擦垫在每个正拍之前（每拍最后一个 16 分）
  reco:      { 3: 'x', 7: 'x', 11: 'x', 15: 'x' },
};

// 代码 → 发声函数
const VOICE = {
  surdo:     { o: 'surdoOpen', m: 'surdoMute' },
  caixa:     { c: 'caixa', a: 'caixaAccent' },
  repinique: { x: 'repique' },
  tamborim:  { x: 'tamborim' },
  chocalho:  { x: 'chocalho' },
  agogo:     { h: 'agogoHi', l: 'agogoLo' },
  cuica:     { u: 'cuicaUp', d: 'cuicaDown' },
  reco:      { x: 'reco' },
};

const LAYERS = ['surdo', 'caixa', 'repinique', 'tamborim', 'chocalho', 'agogo', 'cuica', 'reco'];
const _muted = new Set();

let _bpm = 100;
let _playing = false;
let _step = 0;
let _nextTime = 0;
let _seqTimer = null;

function _stepDur() { return (60 / _bpm) / 4; } // 一个 16 分音符时长

function _scheduleStep(step, time) {
  LAYERS.forEach(L => {
    if (_muted.has(L)) return;
    const code = PATTERN[L][step];
    if (!code) return;
    const fn = VOICE[L][code];
    if (fn && HIT[fn]) HIT[fn](_ctx, time, _master);
  });
  // 视觉：高亮当前列，并让命中的声部格子脉冲
  const delay = Math.max(0, (time - _ctx.currentTime) * 1000);
  const id = setTimeout(() => _renderPlayhead(step), delay);
  _timers.push(id);
}

function _scheduler() {
  while (_nextTime < _ctx.currentTime + 0.12) {
    _scheduleStep(_step, _nextTime);
    _nextTime += _stepDur();
    _step = (_step + 1) % 16;
  }
}

/* ---------- 节奏总谱：DOM 构建 + 实时 playhead ---------- */
const LABEL = {
  surdo: 'surdo 大鼓', caixa: 'caixa 响弦', repinique: 'repinique', tamborim: 'tamborim',
  chocalho: 'chocalho', agogo: 'agogô', cuica: 'cuíca', reco: 'reco-reco'
};
const FREQ = {
  surdo: 'low', caixa: 'mid', repinique: 'mid', tamborim: 'high',
  chocalho: 'high', agogo: 'high', cuica: 'high', reco: 'high'
};
const _cellsByStep = Array.from({ length: 16 }, () => []);
let _prevStep = -1;

// 按声部 + 代码生成对应标记
function _marker(layer, code) {
  const s = document.createElement('span');
  s.className = 'mk';
  if (layer === 'surdo' && code === 'o') s.classList.add('disc', 'big');
  else if (layer === 'surdo' && code === 'm') s.classList.add('ring');
  else if (layer === 'caixa' && code === 'a') s.classList.add('disc', 'med');
  else if (layer === 'caixa' && code === 'c') s.classList.add('disc', 'small');
  else if (layer === 'chocalho') s.classList.add('disc', 'small');
  else if (layer === 'repinique' || layer === 'tamborim') s.classList.add('disc', 'med');
  else if (layer === 'agogo') { s.classList.add('char'); s.textContent = code === 'h' ? '▲' : '▽'; }
  else if (layer === 'cuica') { s.classList.add('char'); s.textContent = code === 'u' ? '↑' : '↓'; }
  else if (layer === 'reco') { s.classList.add('char'); s.textContent = '≈'; }
  else s.classList.add('disc', 'med');
  return s;
}

// 依据 PATTERN 生成总谱（单一数据源，谱面永远=实际在打的）
function _buildScore() {
  const score = document.getElementById('score');
  if (!score) return;
  const corner = document.createElement('div');
  corner.className = 'score-corner';
  score.appendChild(corner);
  for (let i = 0; i < 16; i++) {
    const h = document.createElement('div');
    h.className = 'score-head' + (i % 4 === 0 ? ' beat' : '');
    h.dataset.step = i;
    if (i % 4 === 0) h.textContent = i / 4 + 1;
    score.appendChild(h);
    _cellsByStep[i].push(h);
  }
  LAYERS.forEach(L => {
    const lab = document.createElement('div');
    lab.className = 'score-rowlabel ' + FREQ[L];
    lab.dataset.row = L;
    lab.innerHTML = '<span class="rdot"></span>' + LABEL[L];
    score.appendChild(lab);
    for (let i = 0; i < 16; i++) {
      const c = document.createElement('div');
      c.className = 'score-cell ' + FREQ[L] + (i % 4 === 0 ? ' beat' : '');
      c.dataset.step = i;
      c.dataset.row = L;
      const code = PATTERN[L][i];
      if (code) { c.classList.add('hit'); c.appendChild(_marker(L, code)); }
      score.appendChild(c);
      _cellsByStep[i].push(c);
    }
  });
}

// 高亮当前列；只让"未静音且本步有击点"的格子脉冲
function _renderPlayhead(step) {
  if (_prevStep >= 0) _cellsByStep[_prevStep].forEach(c => c.classList.remove('now', 'fire'));
  _cellsByStep[step].forEach(c => {
    c.classList.add('now');
    if (c.classList.contains('hit') && !_muted.has(c.dataset.row)) c.classList.add('fire');
  });
  _prevStep = step;
}

// 静音的声部整行变暗
function _syncRowMute(name) {
  const on = _muted.has(name);
  document.querySelectorAll('[data-row="' + name + '"]').forEach(el => el.classList.toggle('is-muted', on));
}
function _syncAllRowMute() { LAYERS.forEach(_syncRowMute); }

function toggleEnsemble(btn) {
  const ctx = ac();
  if (_playing) { stopEnsemble(); return; }
  _playing = true;
  _step = 0;
  _nextTime = ctx.currentTime + 0.06;
  _seqTimer = setInterval(_scheduler, 25);
  if (btn) { btn.textContent = '■ 停止合奏'; btn.classList.add('on'); }
  const stage = document.getElementById('bateria-stage');
  if (stage) stage.classList.add('running');
}

function stopEnsemble() {
  _playing = false;
  if (_seqTimer) { clearInterval(_seqTimer); _seqTimer = null; }
  _timers.forEach(clearTimeout);
  _timers.length = 0;
  _cellsByStep.forEach(col => col.forEach(c => c.classList.remove('now', 'fire')));
  _prevStep = -1;
  const btn = document.getElementById('ensemble-toggle');
  if (btn) { btn.textContent = '▶ 整队进场'; btn.classList.remove('on'); }
  const stage = document.getElementById('bateria-stage');
  if (stage) stage.classList.remove('running');
}

// 逐层静音开关
function toggleLayer(name, el) {
  if (_muted.has(name)) { _muted.delete(name); el.classList.remove('muted'); }
  else { _muted.add(name); el.classList.add('muted'); }
  _syncRowMute(name);
}

// 速度调节
function setTempo(v) {
  _bpm = +v;
  const out = document.getElementById('bpm-val');
  if (out) out.textContent = _bpm;
}

// 一键独奏某层（其余静音）——「只听这一层」
function soloLayer(name) {
  LAYERS.forEach(L => {
    const el = document.querySelector('.layer-chip[data-layer="' + L + '"]');
    if (L === name) { _muted.delete(L); el && el.classList.remove('muted'); }
    else { _muted.add(L); el && el.classList.add('muted'); }
  });
  _syncAllRowMute();
  if (!_playing) toggleEnsemble(document.getElementById('ensemble-toggle'));
}

// 全部开
function allLayersOn() {
  _muted.clear();
  document.querySelectorAll('.layer-chip').forEach(el => el.classList.remove('muted'));
  _syncAllRowMute();
}

function stopAllSamba() {
  stopEnsemble();
  if (_ctx) {
    _master.gain.cancelScheduledValues(_ctx.currentTime);
    _master.gain.setValueAtTime(0, _ctx.currentTime);
    _master.gain.linearRampToValueAtTime(0.85, _ctx.currentTime + 0.25);
  }
  document.querySelectorAll('.drum-play.playing').forEach(b => b.classList.remove('playing'));
}

/* ---------- 目录自动生成（与 drums.js 一致） ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('toc-list');
  if (list) {
    document.querySelectorAll('.container section[id]').forEach(sec => {
      const h = sec.querySelector('h2');
      if (!h) return;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + sec.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      list.appendChild(li);
    });
  }
  // 生成节奏总谱（含实时 playhead）
  _buildScore();
});
