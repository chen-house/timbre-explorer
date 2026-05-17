/* ============================================
   EQ 互动逻辑
   ============================================ */

let ac = null;
let sourceNode = null;         // 粉噪声：BufferSource（loop=true）
let synthNodes = null;         // 合成器：{ oscs:[...], mix } — 持续 oscillator
let filterNode = null;
let gainNode = null;
let playing = false;
let eqOn = true;
let loudnessMatch = false;     // 响度匹配开关
let srcType = 'pink';
const BASE_GAIN = 0.55;        // 输出基准电平

/* 频段试听 — 独立的音频链 */
const FREQ_BANDS = {
  low:    { low: 20,    high: 60 },
  warm:   { low: 60,    high: 250 },
  mud:    { low: 250,   high: 500 },
  body:   { low: 500,   high: 2000 },
  bright: { low: 2000,  high: 5000 },
  air:    { low: 5000,  high: 10000 },
  sky:    { low: 10000, high: 20000 },
};
let auditionNodes = null;
let auditionBand = null;
let pinkBufferCache = null;

function getAC() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

/* 生成噪声/合成器素材 */
function buildBuffer(durationSec, type) {
  const a = getAC();
  const len = Math.floor(a.sampleRate * durationSec);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);

  if (type === 'pink') {
    // Paul Kellet 粉噪声算法
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    // Am 类和弦 (A3-C4-E4-A4) — 持续音，无任何包络
    // 这些频率在 t=4s 处所有 sin 都接近零，所以 loop 时几乎无 click
    const freqs = [220, 261.63, 329.63, 440];
    for (let i = 0; i < len; i++) {
      const t = i / a.sampleRate;
      let s = 0;
      freqs.forEach((f, idx) => {
        s += Math.sin(2 * Math.PI * f * t) / (idx + 1.5);
      });
      d[i] = s * 0.16;  // 恒定振幅，没有衰减，没有淡化
    }
  }
  return buf;
}

function stopAll() {
  // 粉噪声路径
  if (sourceNode) {
    try { sourceNode.stop(); } catch (e) {}
    try { sourceNode.disconnect(); } catch (e) {}
    sourceNode = null;
  }
  // 合成器路径 — 停掉所有持续振荡器
  if (synthNodes) {
    synthNodes.oscs.forEach(o => {
      try { o.stop(); } catch (e) {}
      try { o.disconnect(); } catch (e) {}
    });
    try { synthNodes.mix.disconnect(); } catch (e) {}
    synthNodes = null;
  }
  playing = false;
  document.getElementById('main-play').classList.remove('playing');
  document.getElementById('play-icon').innerHTML = '<polygon points="3,2 12,7 3,12"/>';
  document.getElementById('play-status').textContent = '点击播放';
}

function togglePlay() {
  if (playing) { stopAll(); return; }
  // 主播放器启动时先停掉任何正在试听的频段，避免叠加
  stopBandAudition();
  const a = getAC();

  filterNode = a.createBiquadFilter();
  filterNode.type = 'peaking';
  // 用 setValueAtTime 显式设置初始值，避免后续 AudioParam 自动化覆盖
  const t0 = a.currentTime;
  filterNode.frequency.setValueAtTime(parseFloat(document.getElementById('sl-freq').value), t0);
  filterNode.gain.setValueAtTime(eqOn ? parseFloat(document.getElementById('sl-gain').value) : 0, t0);
  filterNode.Q.setValueAtTime(parseFloat(document.getElementById('sl-q').value), t0);

  gainNode = a.createGain();
  gainNode.gain.value = computeOutputGain();

  // 公共下游：filter → gain → destination
  filterNode.connect(gainNode);
  gainNode.connect(a.destination);

  if (srcType === 'pink') {
    // 粉噪声：4 秒 buffer + 循环
    const buf = buildBuffer(4, 'pink');
    sourceNode = a.createBufferSource();
    sourceNode.buffer = buf;
    sourceNode.loop = true;
    sourceNode.connect(filterNode);
    sourceNode.start();
  } else {
    // 合成器：4 个锯齿波振荡器（Am 和弦 A3-C4-E4-A4）
    // 锯齿波包含全部奇偶谐波（f, 2f, 3f, 4f, ...），频谱从基频铺到 Nyquist
    // 这样 EQ 在任意频率都能"撞到东西"，参数变化才有听感
    const mix = a.createGain();
    mix.gain.value = 0.35;   // 锯齿波能量大，整体压低避免削顶
    const oscs = [];
    const freqs = [220, 261.63, 329.63, 440];
    freqs.forEach((f, i) => {
      const osc = a.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const og = a.createGain();
      og.gain.value = 0.2 / (i + 1.5);
      osc.connect(og);
      og.connect(mix);
      osc.start();
      oscs.push(osc);
    });
    mix.connect(filterNode);
    synthNodes = { oscs, mix };
  }

  playing = true;
  document.getElementById('main-play').classList.add('playing');
  document.getElementById('play-icon').innerHTML = '<rect x="3" y="2" width="3" height="10" rx="1"/><rect x="9" y="2" width="3" height="10" rx="1"/>';
  document.getElementById('play-status').textContent = '播放中 — 调节参数实时听变化';
}

function setSource(t) {
  srcType = t;
  const wasPlaying = playing;
  stopAll();
  document.querySelectorAll('[data-source]').forEach(b => {
    b.classList.toggle('active', b.dataset.source === t);
  });
  if (wasPlaying) setTimeout(togglePlay, 50);
}

function toggleEQ() {
  eqOn = !eqOn;
  const btn = document.getElementById('eq-toggle');
  btn.textContent = 'EQ: ' + (eqOn ? '开' : '关');
  btn.classList.toggle('active', eqOn);
  if (filterNode) {
    const t = getAC().currentTime;
    filterNode.gain.setValueAtTime(
      eqOn ? parseFloat(document.getElementById('sl-gain').value) : 0, t
    );
  }
  applyOutputGain();
  drawEQ();
}

function toggleLoudnessMatch() {
  loudnessMatch = !loudnessMatch;
  const btn = document.getElementById('loudness-toggle');
  btn.textContent = '响度匹配: ' + (loudnessMatch ? '开' : '关');
  btn.classList.toggle('active', loudnessMatch);
  applyOutputGain();
}

/* 响度补偿启发式：
   对一个 peaking filter，宽 Q（小 Q 值）影响整个频谱，窄 Q 只影响一个细窄峰。
   补偿系数 = 1 / (1 + Q * 1.5)：宽 Q 强补偿，窄 Q 几乎不补偿。
   这不是 LUFS 那种精确测量，但教学上足以让用户感受到"响 ≠ 好"。 */
function computeOutputGain() {
  if (!loudnessMatch || !eqOn) return BASE_GAIN;
  const gainDB = parseFloat(document.getElementById('sl-gain').value);
  const q = parseFloat(document.getElementById('sl-q').value);
  const compDB = -gainDB / (1 + q * 1.5);   // 单位：dB
  const compLin = Math.pow(10, compDB / 20);
  return BASE_GAIN * compLin;
}

function applyOutputGain() {
  if (gainNode) {
    // 用 setTargetAtTime 做 30 ms 平滑过渡，避免咔哒声
    const target = computeOutputGain();
    gainNode.gain.setTargetAtTime(target, getAC().currentTime, 0.01);
  }
}

function updateEQ() {
  const freq = parseFloat(document.getElementById('sl-freq').value);
  const gain = parseFloat(document.getElementById('sl-gain').value);
  const q = parseFloat(document.getElementById('sl-q').value);

  document.getElementById('v-freq').textContent =
    freq >= 1000 ? (freq / 1000).toFixed(1) + ' kHz' : Math.round(freq) + ' Hz';
  document.getElementById('v-gain').textContent =
    (gain >= 0 ? '+' : '') + gain.toFixed(1) + ' dB';
  document.getElementById('v-q').textContent = q.toFixed(1);

  // 用 setValueAtTime 保证实时更新一定生效；先 cancel 掉之前的调度，
  // 避免与历史 setTargetAtTime/setValueAtTime 事件冲突（这是关键 bug 修复）
  if (filterNode) {
    const t = getAC().currentTime;
    filterNode.frequency.cancelScheduledValues(t);
    filterNode.frequency.setValueAtTime(freq, t);
    filterNode.gain.cancelScheduledValues(t);
    filterNode.gain.setValueAtTime(eqOn ? gain : 0, t);
    filterNode.Q.cancelScheduledValues(t);
    filterNode.Q.setValueAtTime(q, t);
    // 同时直接赋 .value 作为双保险（某些实现下 setValueAtTime 在 currentTime 严格相等时可能延迟生效）
    filterNode.frequency.value = freq;
    filterNode.gain.value = eqOn ? gain : 0;
    filterNode.Q.value = q;
  }
  applyOutputGain();
  drawEQ();
}

function applyPreset(preset) {
  const presets = {
    scan:  { freq: 1000, gain: 10, q: 8,
             status: '扫频模式：增益 +10 dB、极窄 Q。慢慢移动频率，最难听处即问题频率，再翻负值衰减。' },
    phone: { freq: 900, gain: 0, q: 0.4,
             status: '电话声参考位（实际操作应组合 HPF 300 Hz + LPF 3.4 kHz，这里用宽 Q 做近似演示）。' },
    air:   { freq: 12000, gain: 6, q: 0.7,
             status: '空气感：12 kHz 附近 High Shelf 提升，常用于人声"开阔感"和亲密感。' },
    mud:   { freq: 300, gain: -5, q: 1.2,
             status: '去泥浊：250–500 Hz 是混音"浑浊区"，多轨在此堆积，削减后整体立刻通透。' },
    reset: { freq: 1000, gain: 0, q: 1.4,
             status: '已重置 — 零增益状态。' },
  };
  const p = presets[preset];
  if (!p) return;
  document.getElementById('sl-freq').value = p.freq;
  document.getElementById('sl-gain').value = p.gain;
  document.getElementById('sl-q').value = p.q;
  document.getElementById('preset-status').textContent = p.status;
  updateEQ();
}

/* EQ 曲线绘制 */
function drawEQ() {
  const canvas = document.getElementById('eq-canvas');
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

  const freqToX = f => (Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20)) * W;
  const dBToY = g => H / 2 - (g / 15) * (H / 2 - 18);

  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(f => {
    const x = freqToX(f);
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
    ctx.stroke();
  });
  [12, 6, -6, -12].forEach(g => {
    const y = dBToY(g);
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.stroke();
  });

  // 0 dB 虚线
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 曲线
  const freq = parseFloat(document.getElementById('sl-freq').value);
  const gain = eqOn ? parseFloat(document.getElementById('sl-gain').value) : 0;
  const Q = parseFloat(document.getElementById('sl-q').value);

  const N = 400;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const f = Math.pow(10, Math.log10(20) + (Math.log10(20000) - Math.log10(20)) * (i / N));
    const w = f / freq;
    const dB = gain / (1 + Q * Q * (w - 1 / w) * (w - 1 / w));
    pts.push({ x: freqToX(f), y: dBToY(dB) });
  }

  // 填充
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(216,90,48,0.25)');
  grad.addColorStop(1, 'rgba(216,90,48,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // 主曲线
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = eqOn ? '#D85A30' : 'rgba(216,90,48,0.4)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 控制点
  ctx.beginPath();
  ctx.arc(freqToX(freq), dBToY(gain), 6, 0, Math.PI * 2);
  ctx.fillStyle = eqOn ? '#D85A30' : 'rgba(216,90,48,0.4)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(247,243,236,0.95)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 频率标签
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font = '10px ui-monospace, monospace';
  [{ f: 20, l: '20' }, { f: 100, l: '100' }, { f: 1000, l: '1k' },
   { f: 5000, l: '5k' }, { f: 20000, l: '20k' }].forEach(({ f, l }) => {
    ctx.fillText(l, freqToX(f) - 8, H - 5);
  });

  // 增益标签
  [['+12', 12], ['+6', 6], ['0', 0], ['-6', -6], ['-12', -12]].forEach(([l, g]) => {
    ctx.fillText(l, 4, dBToY(g) + 3);
  });
}

/* 电话频谱图 */
function drawPhoneSpectrum() {
  const cv = document.getElementById('phone-canvas');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = cv.getBoundingClientRect();
  cv.width = rect.width * dpr;
  cv.height = rect.height * dpr;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  c.fillStyle = '#FAFAF7';
  c.fillRect(0, 0, W, H);

  const freqToX = f => (Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20)) * W;
  const x300 = freqToX(300);
  const x3400 = freqToX(3400);

  // 高亮电话保留区域
  c.fillStyle = 'rgba(216, 90, 48, 0.12)';
  c.fillRect(x300, 0, x3400 - x300, H);

  // 边界线
  c.strokeStyle = '#D85A30';
  c.lineWidth = 1.2;
  c.setLineDash([4, 3]);
  c.beginPath(); c.moveTo(x300, 8); c.lineTo(x300, H - 18); c.stroke();
  c.beginPath(); c.moveTo(x3400, 8); c.lineTo(x3400, H - 18); c.stroke();
  c.setLineDash([]);

  // 频谱 bars
  const n = 70;
  const seedRand = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < n; i++) {
    const f = Math.pow(10, Math.log10(20) + (Math.log10(20000) - Math.log10(20)) * i / (n - 1));
    const x = freqToX(f);
    const inPhone = f >= 300 && f <= 3400;
    const baseH = inPhone ? (22 + seedRand(i) * 38) : (4 + seedRand(i) * 10);
    c.fillStyle = inPhone ? '#D85A30' : 'rgba(44, 42, 30, 0.18)';
    c.fillRect(x - 3, H / 2 - baseH / 2, 5, baseH);
  }

  // 标签
  c.fillStyle = '#993C1D';
  c.font = '500 11px sans-serif';
  c.fillText('300 Hz', x300 + 4, 18);
  c.fillText('3.4 kHz', x3400 - 50, 18);

  // x 轴
  c.fillStyle = 'rgba(44, 42, 30, 0.4)';
  c.font = '10px ui-monospace, monospace';
  [20, 100, 1000, 10000, 20000].forEach(f => {
    const l = f >= 1000 ? f / 1000 + 'k' : f.toString();
    c.fillText(l, freqToX(f) - 8, H - 4);
  });
}

/* 六种 EQ 形状 SVG 生成 */
function renderShapes() {
  const shapes = [
    { name: 'Bell 钟形', sub: '最常用 — 任意频段提升或衰减',
      d: 'M 5 32 L 70 32 Q 90 32 100 8 Q 110 32 130 32 L 195 32', color: '#D85A30' },
    { name: 'Notch 陷波', sub: '窄而深的衰减，灭单一啸叫',
      d: 'M 5 32 L 85 32 Q 95 32 100 56 Q 105 32 115 32 L 195 32', color: '#D85A30' },
    { name: 'High-Pass 高通', sub: '切低频 — 去掉空调嗡嗡声',
      d: 'M 5 56 L 60 56 Q 75 56 90 32 Q 105 8 130 8 L 195 8', color: '#1D9E75' },
    { name: 'Low-Pass 低通', sub: '切高频 — 制造"闷"和"远"',
      d: 'M 5 8 L 70 8 Q 95 8 110 32 Q 125 56 140 56 L 195 56', color: '#1D9E75' },
    { name: 'Low Shelf 低架', sub: '整个低频区抬升或下压',
      d: 'M 5 14 L 50 14 Q 70 14 85 32 L 195 32', color: '#7B5EA7' },
    { name: 'High Shelf 高架', sub: '整个高频区加亮或变暗',
      d: 'M 5 32 L 110 32 Q 130 32 145 14 L 195 14', color: '#7B5EA7' },
  ];

  const grid = document.getElementById('shapes-grid');
  if (!grid) return;
  shapes.forEach(s => {
    const card = document.createElement('div');
    card.className = 'shape-card';
    card.innerHTML = `
      <div class="shape-svg-wrap">
        <svg width="100%" height="100%" viewBox="0 0 200 64" xmlns="http://www.w3.org/2000/svg">
          <line x1="5" y1="32" x2="195" y2="32" stroke="rgba(44,42,30,0.12)" stroke-width="0.8" stroke-dasharray="2 3"/>
          <path d="${s.d}" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </div>
      <div class="shape-name">${s.name}</div>
      <div class="shape-sub">${s.sub}</div>
    `;
    grid.appendChild(card);
  });
}

/* ============================================
   滤波器斜率演示（HPF 200 Hz，可切 6/12/24/48 dB/oct）
   ============================================ */
// 截止频率定在 500 Hz：一个倍频程内（250-500 Hz）是中低频，
// 普通笔记本/耳塞都能重放，斜率差异在所有设备上都能听到。
// 注：真实工程里 HPF 通常切 60-200 Hz 去隆隆声，但那段需要好的低频监听才能区分斜率
const SLOPE_CUTOFF = 500;
let slopeAC_state = {
  src: null,
  filters: [],
  gain: null,
  playing: false,
  srcType: 'pink',
  slope: 12,           // 当前斜率（dB/oct）
  filterOn: true,      // 滤波开关（关 → 旁路对比）
};

const SLOPE_INFO = {
  6:  '6 dB/oct（一阶模拟）— 极温和过渡，几乎听不出"加了滤波"。模拟时代很多 EQ 默认值。',
  12: '12 dB/oct（二阶 / 巴特沃斯）— 最常见的默认斜率。过渡自然，听感温和。',
  24: '24 dB/oct（四阶）— 明显能听出"被截掉"的形状感。EDM 扫频常用起步斜率。',
  48: '48 dB/oct（八阶）— 几乎一刀切。母带/广播除杂常用，但相位失真和 pre-ringing 也最严重。',
};

/* Web Audio 的 BiquadFilter 是二阶（12 dB/oct）。要做 24/48 就级联多个；
   要做 6（一阶）需要降阶 — 用 Q=0.5 的 biquad 近似单极点滤波器的响应 */
function slopeFilterCount(slope) {
  // 6 → 1 个 Q=0.5 biquad 模拟一阶
  // 12 → 1 个 biquad
  // 24 → 2 个级联
  // 48 → 4 个级联
  return slope === 6 ? 1 : slope / 12;
}
function slopeFilterQ(slope) {
  // 巴特沃斯标准 Q（让通带最平坦）；6 dB/oct 时降为 0.5
  return slope === 6 ? 0.5 : 0.707;
}

function buildSlopeChain(ac) {
  const filters = [];
  const n = slopeFilterCount(slopeAC_state.slope);
  const q = slopeFilterQ(slopeAC_state.slope);
  for (let i = 0; i < n; i++) {
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = SLOPE_CUTOFF;
    f.Q.value = q;
    filters.push(f);
  }
  return filters;
}

function stopSlope() {
  if (!slopeAC_state.playing) return;
  // 停 BufferSource（粉噪声）
  if (slopeAC_state.src && slopeAC_state.src.stop) {
    try { slopeAC_state.src.stop(); } catch (e) {}
  }
  // 停所有合成器 oscillator
  if (slopeAC_state.synthOscs) {
    slopeAC_state.synthOscs.forEach(o => { try { o.stop(); } catch (e) {} });
    slopeAC_state.synthOscs = null;
  }
  slopeAC_state.src = null;
  slopeAC_state.filters = [];
  slopeAC_state.gain = null;
  slopeAC_state.playing = false;
  const btn = document.getElementById('slope-play');
  if (btn) btn.classList.remove('playing');
  const icon = document.getElementById('slope-play-icon');
  if (icon) icon.innerHTML = '<polygon points="3,2 12,7 3,12"/>';
  const status = document.getElementById('slope-play-status');
  if (status) status.textContent = '点击播放';
}

/* 热替换滤波器链 — 不动音源，只把 filter 段拔下来换上新的，
   实现"无缝 A/B 切换"，听感对比最准 */
function reconnectSlopeChain(ac) {
  // 断开 src 上的所有连接（src 本身保持运行）
  try { slopeAC_state.src.disconnect(); } catch (e) {}
  // 断开旧 filter 节点（确保没有幽灵连接）
  slopeAC_state.filters.forEach(f => {
    try { f.disconnect(); } catch (e) {}
  });
  // 建新链
  const filters = slopeAC_state.filterOn ? buildSlopeChain(ac) : [];
  if (filters.length) {
    slopeAC_state.src.connect(filters[0]);
    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
    filters[filters.length - 1].connect(slopeAC_state.gain);
  } else {
    slopeAC_state.src.connect(slopeAC_state.gain);
  }
  slopeAC_state.filters = filters;
}

function toggleSlopePlay() {
  if (slopeAC_state.playing) { stopSlope(); return; }
  // 与其他声源互斥
  if (playing) stopAll();
  stopBandAudition();

  const ac = getAC();

  // 同主 EQ 一致：粉噪 buffer + loop，合成器 OscillatorNode 持续发声
  let src;
  if (slopeAC_state.srcType === 'pink') {
    const buf = buildBuffer(4, 'pink');
    src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
  } else {
    // 用一个 GainNode 作为"虚拟 src"，下面挂 4 个锯齿振荡器
    src = ac.createGain();
    src.gain.value = 0.35;
    const freqs = [220, 261.63, 329.63, 440];
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = 0.2 / (i + 1.5);
      osc.connect(og);
      og.connect(src);
      osc.start();
      // 把 osc 也存进 filters 数组，方便 stopSlope 一并 stop
      slopeAC_state.synthOscs = (slopeAC_state.synthOscs || []);
      slopeAC_state.synthOscs.push(osc);
    });
  }

  const gain = ac.createGain();
  gain.gain.value = 0.55;
  gain.connect(ac.destination);

  slopeAC_state.src = src;
  slopeAC_state.filters = [];
  slopeAC_state.gain = gain;
  slopeAC_state.playing = true;

  // 第一次连上滤波器链
  reconnectSlopeChain(ac);

  document.getElementById('slope-play').classList.add('playing');
  document.getElementById('slope-play-icon').innerHTML =
    '<rect x="3" y="2" width="3" height="10" rx="1"/><rect x="9" y="2" width="3" height="10" rx="1"/>';
  document.getElementById('slope-play-status').textContent = '播放中 — 切换斜率档位感受差异';
}

function setSlopeSource(t) {
  slopeAC_state.srcType = t;
  document.querySelectorAll('[data-slope-src]').forEach(b => {
    b.classList.toggle('active', b.dataset.slopeSrc === t);
  });
  // 换音源（pink ↔ synth）必须重启，因为节点类型完全不同
  if (slopeAC_state.playing) {
    stopSlope();
    setTimeout(toggleSlopePlay, 50);
  }
}

function toggleSlopeFilter() {
  slopeAC_state.filterOn = !slopeAC_state.filterOn;
  const btn = document.getElementById('slope-filter-toggle');
  btn.textContent = '滤波: ' + (slopeAC_state.filterOn ? '开' : '关');
  btn.classList.toggle('active', slopeAC_state.filterOn);
  // 仅热替换 filter 段，不停音源
  if (slopeAC_state.playing) {
    reconnectSlopeChain(getAC());
  }
  drawSlope();
}

function setSlope(slope) {
  slopeAC_state.slope = slope;
  document.querySelectorAll('.slope-tab').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.slope) === slope);
  });
  document.getElementById('slope-info').textContent = SLOPE_INFO[slope];
  console.log('[Slope] switched to', slope, 'dB/oct — filterCount=', slopeFilterCount(slope));
  if (slopeAC_state.playing) {
    // 关键：只热替换 filter 链，src 保持播放，听感无 gap
    reconnectSlopeChain(getAC());
  }
  drawSlope();
}

/* 斜率曲线绘制 — 把 n 阶 HPF 的理论幅频响应画出来 */
function drawSlope() {
  const canvas = document.getElementById('slope-canvas');
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

  // 坐标映射：dB 范围 [-60, +6]
  const freqToX = f => (Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20)) * W;
  const dBToY = g => H - ((g + 60) / 66) * (H - 16) - 8;

  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(f => {
    const x = freqToX(f);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  });
  [0, -12, -24, -36, -48].forEach(g => {
    const y = dBToY(g);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  });

  // 0 dB 虚线
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(0, dBToY(0)); ctx.lineTo(W, dBToY(0));
  ctx.stroke();
  ctx.setLineDash([]);

  // 截止频率竖线
  const xCut = freqToX(SLOPE_CUTOFF);
  ctx.strokeStyle = 'rgba(216, 90, 48, 0.4)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(xCut, 4); ctx.lineTo(xCut, H - 14);
  ctx.stroke();
  ctx.setLineDash([]);

  // 计算并绘制四条参考曲线（淡色）+ 当前选中曲线（亮橙）
  const slopes = [6, 12, 24, 48];
  slopes.forEach(s => {
    const isActive = (s === slopeAC_state.slope);
    const n = slopeFilterCount(s);
    // 多个相同 HPF 级联的理论幅频响应（dB）：
    // 单个 HPF butterworth: |H(f)|² = 1 / (1 + (fc/f)^(2*order))
    // order=1 for 6 dB/oct, order=2 for 12, etc. 但级联 n 个 biquad(2阶) 时总阶数 = 2n.
    const order = (s === 6) ? 1 : 2 * n;
    const N = 400;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const f = Math.pow(10, Math.log10(20) + (Math.log10(20000) - Math.log10(20)) * (i / N));
      const ratio = SLOPE_CUTOFF / f;
      const mag2 = 1 / (1 + Math.pow(ratio, 2 * order));
      const dB = 10 * Math.log10(mag2);
      const x = freqToX(f);
      const y = dBToY(Math.max(dB, -60));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    if (isActive) {
      // 当前活动曲线：填充 + 亮橙
      ctx.strokeStyle = slopeAC_state.filterOn ? '#D85A30' : 'rgba(216,90,48,0.4)';
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = 'rgba(216, 90, 48, 0.14)';
      ctx.lineWidth = 1.2;
    }
    ctx.stroke();
  });

  // 频率标签
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font = '10px ui-monospace, monospace';
  [{ f: 20, l: '20' }, { f: 100, l: '100' }, { f: 200, l: '200' },
   { f: 1000, l: '1k' }, { f: 5000, l: '5k' }, { f: 20000, l: '20k' }].forEach(({ f, l }) => {
    ctx.fillText(l, freqToX(f) - 8, H - 4);
  });

  // 截止频率标注
  ctx.fillStyle = '#D85A30';
  ctx.font = '500 10px ui-monospace, monospace';
  ctx.fillText('fc=' + SLOPE_CUTOFF, xCut + 4, 12);

  // dB 标签
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font = '10px ui-monospace, monospace';
  [['0', 0], ['-12', -12], ['-24', -24], ['-36', -36], ['-48', -48]].forEach(([l, g]) => {
    ctx.fillText(l, 4, dBToY(g) + 3);
  });
}

/* ============================================
   频段试听 — 独立音频链：粉噪声 → HPF(24dB/oct) → LPF(24dB/oct) → 输出
   ============================================ */
function getPinkBuffer() {
  if (pinkBufferCache) return pinkBufferCache;
  // 3 秒粉噪声缓冲，循环播放
  pinkBufferCache = buildBuffer(3, 'pink');
  return pinkBufferCache;
}

function stopBandAudition() {
  if (!auditionNodes) {
    // 即使没有节点，也清理一下 UI 状态
    if (auditionBand) updateBandBtn(auditionBand, false);
    auditionBand = null;
    return;
  }
  try { auditionNodes.src.stop(); } catch (e) {}
  // 让 GC 收掉滤波器节点
  auditionNodes = null;
  if (auditionBand) updateBandBtn(auditionBand, false);
  auditionBand = null;
}

function updateBandBtn(bandId, isPlaying) {
  const btn = document.querySelector(`.freq-btn[data-band="${bandId}"]`);
  if (!btn) return;
  btn.classList.toggle('playing', isPlaying);
  const label = btn.querySelector('.label');
  if (label) label.textContent = isPlaying ? '停' : '试听';
}

function startBandAudition(bandId) {
  // 先停掉所有可能正在响的（主播放器 + 其他频段）
  if (playing) stopAll();
  stopBandAudition();

  const band = FREQ_BANDS[bandId];
  if (!band) return;

  const a = getAC();
  const src = a.createBufferSource();
  src.buffer = getPinkBuffer();
  src.loop = true;

  // 级联两级 12 dB/oct → 24 dB/oct 滚降
  // 让带外频率衰减足够干净，听感才"只剩这一段"
  const mkHP = (f) => {
    const n = a.createBiquadFilter();
    n.type = 'highpass';
    n.frequency.value = f;
    n.Q.value = 0.707; // Butterworth — 最平坦通带
    return n;
  };
  const mkLP = (f) => {
    const n = a.createBiquadFilter();
    n.type = 'lowpass';
    n.frequency.value = f;
    n.Q.value = 0.707;
    return n;
  };

  const hp1 = mkHP(band.low);
  const hp2 = mkHP(band.low);
  const lp1 = mkLP(band.high);
  const lp2 = mkLP(band.high);

  const gain = a.createGain();
  // 各段输出统一 — 让用户真切感受到 Fletcher-Munson 效应
  // 不做能量补偿是有意为之的：训练耳朵 ≠ 制造假象
  gain.gain.value = 0.55;

  src.connect(hp1);
  hp1.connect(hp2);
  hp2.connect(lp1);
  lp1.connect(lp2);
  lp2.connect(gain);
  gain.connect(a.destination);

  src.start();

  auditionNodes = { src, hp1, hp2, lp1, lp2, gain };
  auditionBand = bandId;
  updateBandBtn(bandId, true);
}

function toggleBandAudition(bandId) {
  if (auditionBand === bandId) {
    stopBandAudition();
  } else {
    startBandAudition(bandId);
  }
}

/* ============================================
   思考流程图节点点击展开
   ============================================ */
const FLOW_DETAILS = {
  listen: {
    title: '① 在混音上下文里听',
    body: '把所有轨道一起放。单轨 solo 下"显得需要"的处理，回到混音里常常是多余的，甚至会让这条轨道在混音里消失或打架。新手最常踩的坑就是 solo 调 EQ，然后整个混音失衡。'
  },
  diagnose: {
    title: '② 诊断 — 问自己：有具体毛病吗？',
    body: '"刺耳？嗡嗡？糊？盒声？齿音过强？低频堆？" 能说出具体描述的就是有问题，需要走修正路径。如果只是"我想让它更亮/更厚/更温暖"，那是创意需求 — 走创意路径。两者用的 EQ 动作完全不同。'
  },
  corrective: {
    title: '修正动作 — 减为主',
    body: '动作模板：(1) HPF 切轨道用不到的低频；(2) 扫频找问题：Bell EQ 窄 Q (8+)，Gain +10 dB，慢慢扫，最难听处即问题频率；(3) 把那一点的 Gain 反向 -3 ~ -6 dB 衰减；(4) 不要在多个地方都做大动作 — 一条轨道通常只需要 1-3 个修正点。'
  },
  creative: {
    title: '创意动作 — 加为主，但要慎',
    body: '动作模板：(1) 先决定方向 — "我要它更近 / 更亮 / 更有空气感"，是声音设计意图，不是参数选择；(2) 用宽 Q (0.5-1.4)、小幅度 (+2 ~ +4 dB) 的 Bell 或 Shelf；(3) 加的同时往往要在别处减 — 否则只是变响。这是混音师常说的 "every plus needs a minus"。'
  },
  ab: {
    title: '③ A/B 验证 — 响度匹配是关键',
    body: '把 EQ 开/关频繁切换（≤ 3 秒一次，人耳短时记忆窗口）。但必须开"响度匹配"— 否则你只是在比较"响"和"不响"，而不是"好"和"不好"。专业 EQ 插件如 FabFilter Pro-Q、iZotope Ozone 都内置 gain match 功能。'
  },
  judge: {
    title: '判断 — 真的更好，还是只是更响？',
    body: '一旦做了响度匹配，很多"明显的提升"会现出原形：原来只是变响了。真正"更好"的处理是：响度相同的情况下，某个特性变得更清楚（人声更前、贝斯更稳、空间更宽）— 而不是"整体上一个模糊的好"。'
  },
  commit: {
    title: '真的好 → 保留，但还要"过段时间再听一次"',
    body: '即使现在 A/B 觉得好，过 10 分钟、第二天耳朵新鲜时，再做一次 A/B 验证。混音师调 EQ 不是一次定稿，而是反复回到现场。所谓"参考混音"也是这个目的 — 用客观参照对抗主观漂移。'
  },
};

function selectFlowNode(id) {
  document.querySelectorAll('.flow-node').forEach(n => n.classList.remove('selected'));
  const node = document.querySelector(`.flow-node[data-flow-id="${id}"]`);
  if (node) node.classList.add('selected');

  const info = FLOW_DETAILS[id];
  const detail = document.getElementById('flow-detail');
  if (!detail || !info) return;
  detail.innerHTML =
    `<span class="flow-detail-title">${info.title}</span>${info.body}`;
}

function bindFlowNodes() {
  document.querySelectorAll('.flow-node').forEach(node => {
    const id = node.dataset.flowId;
    node.addEventListener('click', () => selectFlowNode(id));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectFlowNode(id);
      }
    });
  });
}

/* ============================================
   目录 — 扫描 .container 下所有 section 的 h2，自动建表
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
    if (!sec.id) sec.id = 'sec-' + idx;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + sec.id;
    a.innerHTML = `<span class="toc-num">${String(idx).padStart(2, '0')}</span><span>${h2.textContent.trim()}</span>`;
    li.appendChild(a);
    list.appendChild(li);
  });
}

/* 暴露调试入口到 window — 用于 console 诊断 */
window.eqDebug = {
  get ac() { return ac; },
  get sourceNode() { return sourceNode; },
  get synthNodes() { return synthNodes; },
  get filterNode() { return filterNode; },
  get playing() { return playing; },
  get srcType() { return srcType; },
  version: '20260515e',
};

/* 初始化 */
window.addEventListener('DOMContentLoaded', () => {
  buildTOC();
  renderShapes();
  bindFlowNodes();
  setTimeout(() => {
    drawEQ();
    drawPhoneSpectrum();
    drawSlope();
  }, 50);

  window.addEventListener('resize', () => {
    drawEQ();
    drawPhoneSpectrum();
    drawSlope();
  });

  // 加载完成提示（确认这次的 JS 真的跑起来了）
  console.log('[EQ.js] version 20260515e loaded — slope cutoff 500Hz');
});
