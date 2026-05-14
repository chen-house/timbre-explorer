/* ============================================
   氛围色页 — 25 个 Web Audio 实时合成示例
   原 ambient.html 的合成逻辑移植，UI 适配本站设计系统
   ============================================ */

let ACX = null;
function getACX() {
  if (!ACX) ACX = new (window.AudioContext || window.webkitAudioContext)();
  if (ACX.state === 'suspended') ACX.resume();
  return ACX;
}

let curNodes = [];
let curBtn = null;
let curAnalyser = null;
let vizRAF = null;
let progRAF = null;
const DUR = 30;  // 每个声音播放 30 秒

/* ── 辅助 ── */
function mkNoise(ctx, type) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (type === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (type === 'pink') {
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = .99886*b0+w*.0555179; b1 = .99332*b1+w*.0750759;
      b2 = .96900*b2+w*.1538520; b3 = .86650*b3+w*.3104856;
      b4 = .55000*b4+w*.5329522; b5 = -.7616*b5-w*.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+w*.5362) * .11;
    }
  } else {  // brown
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + .02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}
function mkG(ctx, v) { const g = ctx.createGain(); g.gain.value = v; return g; }
function mkF(ctx, type, freq, q) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
function mkA(ctx) { const a = ctx.createAnalyser(); a.fftSize = 512; return a; }
function ch() { for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); }
function makeIR(ctx, len) {
  const buf = ctx.createBuffer(2, ctx.sampleRate * len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.8);
  }
  return buf;
}
function fadeEnv(g, ctx, peak) {
  const p = peak || g.gain.value;
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(p, ctx.currentTime + 2);
  g.gain.setValueAtTime(p, ctx.currentTime + DUR - 2.5);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + DUR);
}
function mkLFO(ctx, freq, depth, target, nodes) {
  const l = ctx.createOscillator(); const g = ctx.createGain();
  l.frequency.value = freq; g.gain.value = depth;
  l.connect(g); g.connect(target);
  l.start(); nodes.push(l);
  return l;
}

/* ============================================
   声音定义 — 25 个发生器
   ============================================ */
const SOUNDS = {
  /* === 0. 自然环境音 === */
  forest: {
    name: '森林鸟鸣', subtype: 'Nature Atmos', eng: 'Natural ambience · 带通粉噪声', color: '#1D9E75',
    desc: '粉噪声经带通滤波，集中 800Hz–5kHz，模拟树冠层鸟鸣与风叶叠加，是最典型的自然 Atmos 素材。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .08);
      const n = mkNoise(ctx, 'pink'), f = mkF(ctx, 'bandpass', 2000, .4), f2 = mkF(ctx, 'highpass', 700, .3);
      ch(n, f, f2, m, a, ctx.destination);
      n.start(); nodes.push(n);
      mkLFO(ctx, .3, 800, f.frequency, nodes);
      fadeEnv(m, ctx, .08);
      return { a, m, nodes };
    }
  },
  stream: {
    name: '溪流水声', subtype: 'Water Texture', eng: 'Running stream · 带通白噪声', color: '#378ADD',
    desc: '白噪声经带通滤波后叠加振幅调制，模拟湍急水流的随机撞击，中频突出，颗粒感强。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .09);
      const n = mkNoise(ctx, 'white'), f = mkF(ctx, 'bandpass', 1100, .5);
      ch(n, f, m, a, ctx.destination);
      n.start(); nodes.push(n);
      mkLFO(ctx, .7, 250, f.frequency, nodes);
      fadeEnv(m, ctx, .09);
      return { a, m, nodes };
    }
  },
  fire: {
    name: '篝火噼啪', subtype: 'Impulse Noise', eng: 'Campfire crackle · 棕噪声脉冲', color: '#EF9F27',
    desc: '棕噪声低频托底，叠加振幅包络调制模拟噼啪，是典型的非稳态（Non-stationary）氛围素材。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .1);
      const n = mkNoise(ctx, 'brown'), f = mkF(ctx, 'lowpass', 700, .5);
      ch(n, f, m, a, ctx.destination);
      n.start(); nodes.push(n);
      mkLFO(ctx, 1.4, .04, m.gain, nodes);
      fadeEnv(m, ctx, .1);
      return { a, m, nodes };
    }
  },
  wind: {
    name: '风过树梢', subtype: 'Low Noise Bed', eng: 'Wind through trees · 低通粉噪声', color: '#888780',
    desc: '粉噪声经低通滤波集中在低频，配合缓慢振幅 LFO 模拟风速变化，频率重心远低于雨声。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .08);
      const n = mkNoise(ctx, 'pink'), f = mkF(ctx, 'lowpass', 450, .3);
      ch(n, f, m, a, ctx.destination);
      n.start(); nodes.push(n);
      mkLFO(ctx, .12, .035, m.gain, nodes);
      fadeEnv(m, ctx, .08);
      return { a, m, nodes };
    }
  },

  /* === 1. 气候与水声 === */
  rain: {
    name: '窗边雨声', subtype: 'White Noise Wash', eng: 'Rain on window · 高通+低通白噪声', color: '#85B7EB',
    desc: '白噪声经高通+低通双滤波，频谱集中在 1k–6kHz，均匀沙沙质感，掩蔽效果最佳。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .1);
      const n = mkNoise(ctx, 'white'), f1 = mkF(ctx, 'highpass', 900, .3), f2 = mkF(ctx, 'lowpass', 5500, .2);
      ch(n, f1, f2, m, a, ctx.destination);
      n.start(); nodes.push(n);
      fadeEnv(m, ctx, .1);
      return { a, m, nodes };
    }
  },
  thunder: {
    name: '远雷滚滚', subtype: 'Sub-bass Rumble', eng: 'Distant thunder · 低通棕噪声', color: '#534AB7',
    desc: '棕噪声经低通滤波集中在 20–150Hz，缓慢包络调制，能量进入次低频，产生明显身体震感。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .15);
      const n = mkNoise(ctx, 'brown'), f = mkF(ctx, 'lowpass', 130, 2.5);
      ch(n, f, m, a, ctx.destination);
      n.start(); nodes.push(n);
      mkLFO(ctx, .06, .055, m.gain, nodes);
      fadeEnv(m, ctx, .15);
      return { a, m, nodes };
    }
  },
  ocean: {
    name: '海浪潮涌', subtype: 'LFO Swell', eng: 'Ocean waves · 潮涌调制', color: '#378ADD',
    desc: '棕噪声低通滤波后以 0.12Hz LFO 调制振幅，模拟周期 8–10s 的涌浪，低频饱满，纵深感强。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .1);
      const n = mkNoise(ctx, 'brown'), f = mkF(ctx, 'lowpass', 850, .4);
      ch(n, f, m, a, ctx.destination);
      n.start(); nodes.push(n);
      mkLFO(ctx, .12, .055, m.gain, nodes);
      mkLFO(ctx, .08, 180, f.frequency, nodes);
      fadeEnv(m, ctx, .1);
      return { a, m, nodes };
    }
  },
  storm: {
    name: '暴风雪', subtype: 'Wide-band Noise', eng: 'Blizzard · 白+粉噪声双层', color: '#B5D4F4',
    desc: '白噪声与粉噪声双层混合，全频段覆盖，高频刺骨风声叠加低频气压变动，传递紧迫情绪底色。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .09);
      const w = mkNoise(ctx, 'white'), p = mkNoise(ctx, 'pink');
      const g1 = mkG(ctx, .55), g2 = mkG(ctx, .45), fh = mkF(ctx, 'highpass', 1400, .3);
      ch(w, g1, m, a, ctx.destination);
      ch(p, g2, fh, m);
      w.start(); p.start(); nodes.push(w, p);
      mkLFO(ctx, .22, .04, m.gain, nodes);
      fadeEnv(m, ctx, .09);
      return { a, m, nodes };
    }
  },

  /* === 2. 城市与人造 === */
  ac: {
    name: '空调低鸣', subtype: 'Industrial Drone', eng: 'HVAC hum · 50Hz 工频叠加', color: '#888780',
    desc: '以 50Hz 工频为基音叠加 100/150/200/300Hz 谐波，是最典型的工业 Drone — 稳定、枯燥、难以察觉。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .07);
      const lp = mkF(ctx, 'lowpass', 400, .5);
      ch(lp, m, a, ctx.destination);
      [50, 100, 150, 200, 300].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = mkG(ctx, .22 / (i + 1));
        ch(o, g, lp); o.start(); nodes.push(o);
      });
      fadeEnv(m, ctx, .07);
      return { a, m, nodes };
    }
  },
  subway: {
    name: '地铁隆隆', subtype: 'Rhythmic Noise Bed', eng: 'Subway rumble · 节律底噪', color: '#5F5E5A',
    desc: '棕噪声经带通滤波聚焦 80–300Hz，叠加 0.3Hz 振幅脉动，模拟车轮接触铁轨的节律震动。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .12);
      const n = mkNoise(ctx, 'brown'), f = mkF(ctx, 'bandpass', 190, 1.5);
      ch(n, f, m, a, ctx.destination);
      n.start(); nodes.push(n);
      mkLFO(ctx, .32, .04, m.gain, nodes);
      fadeEnv(m, ctx, .12);
      return { a, m, nodes };
    }
  },
  cafe: {
    name: '咖啡馆混响', subtype: 'Social Ambience', eng: 'Cafe ambience · 中频粉噪声', color: '#EF9F27',
    desc: '粉噪声经带通聚焦中频，叠加缓慢振幅调制，模拟人声与器皿碰撞经空间混响后的"社交白噪声"。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .07);
      const n = mkNoise(ctx, 'pink'), f = mkF(ctx, 'bandpass', 950, .6);
      ch(n, f, m, a, ctx.destination);
      n.start(); nodes.push(n);
      mkLFO(ctx, .45, .025, m.gain, nodes);
      fadeEnv(m, ctx, .07);
      return { a, m, nodes };
    }
  },

  /* === 3. 乐器延音 === */
  strings: {
    name: '弦乐长弓', subtype: 'Orchestral String Pad', eng: 'String pad · 微失谐叠加', color: '#7B5EA7',
    desc: '六把弦乐微量失谐（±0.4Hz）叠加，低通滤波后形成厚重泛音晕，是交响乐 Pad 的核心技法。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .07);
      const lp = mkF(ctx, 'lowpass', 1100, .5);
      ch(lp, m, a, ctx.destination);
      [220, 220.4, 440, 440.7, 330, 329.6].forEach(f => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const g = mkG(ctx, .15);
        ch(o, g, lp); o.start(); nodes.push(o);
      });
      fadeEnv(m, ctx, .07);
      return { a, m, nodes };
    }
  },
  organ: {
    name: '管风琴持续音', subtype: 'Pipe Organ Drone', eng: 'Pipe organ · 谐波 Drone', color: '#534AB7',
    desc: '锯齿波 110Hz 叠加六次谐波，各次谐波按 1/n 衰减，低通滤波，模拟管风琴充满空间的驻留音。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .065);
      const lp = mkF(ctx, 'lowpass', 1400, .3);
      ch(lp, m, a, ctx.destination);
      [110, 220, 330, 440, 550, 660].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const g = mkG(ctx, .22 / (i + 1));
        ch(o, g, lp); o.start(); nodes.push(o);
      });
      fadeEnv(m, ctx, .065);
      return { a, m, nodes };
    }
  },
  bowl: {
    name: '西藏颂钵', subtype: 'Resonant Overtone Decay', eng: 'Singing bowl · 泛音拍频颤动', color: '#1D9E75',
    desc: '432/864/1296Hz 三阶泛音同时衰减，各阶衰减速度不同；432 与 433.2Hz 微失谐产生拍频颤动感。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .12);
      ch(m, a, ctx.destination);
      [[432, 433.2], [864, 865], [1296, 1297]].forEach((pair, i) => {
        pair.forEach(f => {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          const g = mkG(ctx, .28 / (i + 1));
          g.gain.setValueAtTime(.28 / (i + 1), ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + DUR);
          ch(o, g, m); o.start(); nodes.push(o);
        });
      });
      return { a, m, nodes };
    }
  },
  pianosus: {
    name: '钢琴泛音踏板', subtype: 'Sympathetic Resonance', eng: 'Piano sustain · 五音共鸣', color: '#9FE1CB',
    desc: 'C 大调五音同时发声，各音按指数衰减，模拟踏板踩下后全弦共鸣激发同频泛音的金属声云。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .09);
      ch(m, a, ctx.destination);
      [261.6, 329.6, 392, 523.2, 659.3].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = mkG(ctx, .22 / (i * .6 + 1));
        g.gain.setValueAtTime(.001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(.22 / (i * .6 + 1), ctx.currentTime + .4);
        g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + DUR);
        ch(o, g, m); o.start(); nodes.push(o);
      });
      return { a, m, nodes };
    }
  },

  /* === 4. 合成器氛围 === */
  pad: {
    name: 'Pad', subtype: 'Warm Pad', eng: 'Synthesizer pad · 失谐+混响', color: '#D85A30',
    desc: '四个锯齿波微失谐叠加，低通滤波截止 600Hz，卷积混响尾巴 3s，Attack 2s 渐入。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .09);
      const ir = makeIR(ctx, 3), vb = ctx.createConvolver(); vb.buffer = ir;
      const lp = mkF(ctx, 'lowpass', 600, .4);
      ch(lp, vb, m, a, ctx.destination);
      [130.8, 164.8, 196, 261.6].forEach(f => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f + Math.random() * .4 - .2;
        const g = mkG(ctx, .2);
        ch(o, g, lp); o.start(); nodes.push(o);
      });
      m.gain.setValueAtTime(0, ctx.currentTime);
      m.gain.linearRampToValueAtTime(.09, ctx.currentTime + 2.2);
      m.gain.setValueAtTime(.09, ctx.currentTime + DUR - 2.5);
      m.gain.linearRampToValueAtTime(0, ctx.currentTime + DUR);
      return { a, m, nodes };
    }
  },
  droneS: {
    name: 'Drone', subtype: 'Sub Drone', eng: 'Synth drone · 次低频单音', color: '#A07820',
    desc: '55Hz 正弦基音叠加 110Hz 泛音，低通滤波限制在 320Hz 以下 — 催眠感来自这份"无变化"。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .1);
      const lp = mkF(ctx, 'lowpass', 320, 1);
      ch(lp, m, a, ctx.destination);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sine'; o1.frequency.value = 55;
      o2.type = 'sine'; o2.frequency.value = 110;
      const g1 = mkG(ctx, .75), g2 = mkG(ctx, .3);
      ch(o1, g1, lp); ch(o2, g2, lp);
      o1.start(); o2.start(); nodes.push(o1, o2);
      fadeEnv(m, ctx, .1);
      return { a, m, nodes };
    }
  },
  atmos: {
    name: 'Atmos', subtype: 'Atmospheric Space', eng: 'Atmospheric texture · 宽频混响', color: '#378ADD',
    desc: '粉噪声经低通滤波后通过 5s 长尾卷积混响，所有瞬态被掩盖，剩下无边无际的"空气感"。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .09);
      const ir = makeIR(ctx, 5), vb = ctx.createConvolver(); vb.buffer = ir;
      const n = mkNoise(ctx, 'pink'), lp = mkF(ctx, 'lowpass', 1800, .2);
      ch(n, lp, vb, m, a, ctx.destination);
      n.start(); nodes.push(n);
      fadeEnv(m, ctx, .09);
      return { a, m, nodes };
    }
  },
  texture: {
    name: 'Texture', subtype: 'Granular Texture', eng: 'Granular · 颗粒+基础音叠加', color: '#1D9E75',
    desc: '220Hz 锯齿波叠加高频白噪声（带通 3200Hz），两层独立并分别连接主增益，LFO 调制噪声滤波频率。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .08);
      ch(m, a, ctx.destination);
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 220;
      const lpOsc = mkF(ctx, 'lowpass', 850, .5), gOsc = mkG(ctx, .55);
      ch(osc, lpOsc, gOsc, m);
      osc.start(); nodes.push(osc);
      const noiseNode = mkNoise(ctx, 'white');
      const bpNoise = mkF(ctx, 'bandpass', 3200, .9), gNoise = mkG(ctx, .5);
      ch(noiseNode, bpNoise, gNoise, m);
      noiseNode.start(); nodes.push(noiseNode);
      const lfoOsc = ctx.createOscillator(), lfoG = ctx.createGain();
      lfoOsc.frequency.value = 1.6; lfoG.gain.value = 700;
      lfoOsc.connect(lfoG); lfoG.connect(bpNoise.frequency);
      lfoOsc.start(); nodes.push(lfoOsc);
      fadeEnv(m, ctx, .08);
      return { a, m, nodes };
    }
  },
  wash: {
    name: 'Ambient Wash', subtype: 'Shimmer Wash', eng: 'Guitar wash · 无限混响漂浮', color: '#D4537E',
    desc: 'G3/B3/D4 三个锯齿波叠加，低通滤波后经 6s 长尾卷积混响，音符轮廓消失 — Shoegaze 核心音色。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .08);
      const ir = makeIR(ctx, 6), vb = ctx.createConvolver(); vb.buffer = ir;
      const lp = mkF(ctx, 'lowpass', 900, .4);
      ch(lp, vb, m, a, ctx.destination);
      [196, 246.9, 293.7].forEach(f => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const g = mkG(ctx, .22);
        ch(o, g, lp); o.start(); nodes.push(o);
      });
      fadeEnv(m, ctx, .08);
      return { a, m, nodes };
    }
  },

  /* === 5. 采样处理 === */
  reverseVerb: {
    name: '反向混响', subtype: 'Reverse Reverb', eng: 'Reverse reverb · 时间轴倒置', color: '#D4537E',
    desc: '周期性振幅包络从零渐涨再骤降，模拟声音"提前到来后消失"的倒置时间感，每 5s 一个循环。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .0001);
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 220;
      const lp = mkF(ctx, 'lowpass', 600, .5);
      ch(osc, lp, m, a, ctx.destination);
      osc.start(); nodes.push(osc);
      for (let i = 0; i < 6; i++) {
        m.gain.linearRampToValueAtTime(.28, ctx.currentTime + 1 + i * 5);
        m.gain.linearRampToValueAtTime(.0001, ctx.currentTime + 2.5 + i * 5);
      }
      m.gain.linearRampToValueAtTime(0, ctx.currentTime + DUR);
      const n = mkNoise(ctx, 'pink'), fn = mkF(ctx, 'bandpass', 950, .4), gn = mkG(ctx, .04);
      ch(n, fn, gn, a, ctx.destination);
      n.start(); nodes.push(n);
      return { a, m, nodes };
    }
  },
  stretched: {
    name: '极限拉伸', subtype: 'Time-stretched Drone', eng: 'Paul Stretch · 缓慢泛音云', color: '#ED93B1',
    desc: '80/160/240Hz 三层正弦波以极慢 LFO（0.05Hz）调制频率，模拟 Paul Stretch 拉伸后瞬态消失的泛音云。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .1);
      const lp = mkF(ctx, 'lowpass', 380, .3);
      ch(lp, m, a, ctx.destination);
      [80, 160, 240].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = mkG(ctx, .35 / (i + 1));
        ch(o, g, lp); o.start(); nodes.push(o);
        const lo = ctx.createOscillator(), loG = ctx.createGain();
        lo.frequency.value = .05 + i * .02; loG.gain.value = 8 + i * 4;
        lo.connect(loG); loG.connect(o.frequency);
        lo.start(); nodes.push(lo);
      });
      fadeEnv(m, ctx, .1);
      return { a, m, nodes };
    }
  },
  field: {
    name: '场录处理', subtype: 'Processed Field Recording', eng: 'Treated field · 滤波+混响', color: '#B4B2A9',
    desc: '棕噪声经带通滤波（650Hz）叠加缓慢频率调制，模拟工厂/街道录音经过 Reverb 与 EQ 处理后的工业氛围质感。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .09);
      const n = mkNoise(ctx, 'brown'), bp = mkF(ctx, 'bandpass', 650, .6);
      ch(n, bp, m, a, ctx.destination);
      n.start(); nodes.push(n);
      const lo = ctx.createOscillator(), loG = ctx.createGain();
      lo.frequency.value = .28; loG.gain.value = .03;
      lo.connect(loG); loG.connect(m.gain);
      lo.start(); nodes.push(lo);
      const lo2 = ctx.createOscillator(), lo2G = ctx.createGain();
      lo2.frequency.value = .12; lo2G.gain.value = 130;
      lo2.connect(lo2G); lo2G.connect(bp.frequency);
      lo2.start(); nodes.push(lo2);
      fadeEnv(m, ctx, .09);
      return { a, m, nodes };
    }
  },
  noiseLayer: {
    name: '噪声层叠', subtype: 'Layered Noise Bed', eng: 'Brown + pink stacking', color: '#888780',
    desc: '棕噪声（低通 600Hz）叠加粉噪声（带通 900Hz），比例 6:4，以超慢 LFO 整体调制，制造密度极高的声音底层。',
    make(ctx) {
      const nodes = [], a = mkA(ctx), m = mkG(ctx, .11);
      const b = mkNoise(ctx, 'brown'), p = mkNoise(ctx, 'pink');
      const fb = mkF(ctx, 'lowpass', 600, .3), fp = mkF(ctx, 'bandpass', 900, .5);
      const gb = mkG(ctx, .65), gp = mkG(ctx, .42);
      ch(b, fb, gb, m, a, ctx.destination);
      ch(p, fp, gp, m);
      b.start(); p.start(); nodes.push(b, p);
      const lo = ctx.createOscillator(), loG = ctx.createGain();
      lo.frequency.value = .09; loG.gain.value = .038;
      lo.connect(loG); loG.connect(m.gain);
      lo.start(); nodes.push(lo);
      fadeEnv(m, ctx, .11);
      return { a, m, nodes };
    }
  },
};

const GRIDS = [
  ['forest', 'stream', 'fire', 'wind'],
  ['rain', 'thunder', 'ocean', 'storm'],
  ['ac', 'subway', 'cafe'],
  ['strings', 'organ', 'bowl', 'pianosus'],
  ['pad', 'droneS', 'atmos', 'texture', 'wash'],
  ['reverseVerb', 'stretched', 'field', 'noiseLayer'],
];

/* ============================================
   控制：开始/停止/UI 状态
   ============================================ */
function stopAll() {
  if (curBtn) { setBtn(curBtn, false); curBtn = null; }
  curNodes.forEach(n => {
    try {
      if (n.gain) { n.gain.cancelScheduledValues(0); n.gain.setValueAtTime(0, 0); }
      if (n.stop) n.stop(0);
      n.disconnect();
    } catch (e) {}
  });
  curNodes = []; curAnalyser = null;
  if (vizRAF) { cancelAnimationFrame(vizRAF); vizRAF = null; }
  if (progRAF) { cancelAnimationFrame(progRAF); progRAF = null; }
  document.querySelectorAll('.sc-prog').forEach(p => p.style.width = '0%');
  document.querySelectorAll('.sound-card').forEach(c => c.classList.remove('playing'));
}

function setBtn(btn, on) {
  const svg = btn.querySelector('svg');
  const span = btn.querySelector('.label');
  if (on) {
    btn.classList.add('on');
    if (svg) svg.innerHTML = '<rect x="2" y="2" width="3" height="9" rx="1" fill="currentColor"/><rect x="8" y="2" width="3" height="9" rx="1" fill="currentColor"/>';
    if (span && span.textContent !== '停止') span.textContent = '停止';
  } else {
    btn.classList.remove('on');
    if (svg) svg.innerHTML = '<polygon points="2,1 11,6.5 2,12"/>';
    if (span && span.textContent === '停止') span.textContent = '播放';
  }
}

function play(btn, key) {
  getACX();
  const was = btn.classList.contains('on');
  stopAll();
  if (was) return;

  const s = SOUNDS[key];
  if (!s) return;

  const card = document.getElementById('sc_' + key);
  if (card) card.classList.add('playing');

  curBtn = btn;
  const res = s.make(getACX());
  curNodes = res.nodes || [];
  curAnalyser = res.a;
  setBtn(btn, true);

  const vizC = document.getElementById('sv_' + key);
  if (vizC) startViz(res.a, vizC, s.color);

  const pg = document.getElementById('sp_' + key);
  if (pg) startProg(pg);

  setTimeout(() => { if (curBtn === btn) stopAll(); }, DUR * 1000);
}

function playCompare(key, btn) {
  getACX();
  const was = btn.classList.contains('on');
  stopAll();
  if (was) return;

  const s = SOUNDS[key];
  if (!s) return;

  curBtn = btn;
  const res = s.make(getACX());
  curNodes = res.nodes || [];
  curAnalyser = res.a;
  setBtn(btn, true);

  const cv = document.getElementById('compareViz');
  if (cv) startViz(res.a, cv, s.color);

  setTimeout(() => { if (curBtn === btn) stopAll(); }, DUR * 1000);
}

function startViz(analyser, canvas, color) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx2 = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const buf = new Uint8Array(analyser.frequencyBinCount);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  function draw() {
    vizRAF = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(buf);
    ctx2.fillStyle = '#1A1816';
    ctx2.fillRect(0, 0, W, H);
    const bw = W / buf.length * 2.2;
    let x = 0;
    for (let i = 0; i < buf.length; i++) {
      const h = (buf[i] / 255) * H;
      const al = .3 + (buf[i] / 255) * .7;
      ctx2.fillStyle = `rgba(${r},${g},${b},${al})`;
      ctx2.fillRect(x, H - h, Math.max(bw - 1, 1), h);
      x += bw;
    }
  }
  draw();
}

function startProg(bar) {
  const t0 = performance.now();
  function step(now) {
    const pct = Math.min((now - t0) / (DUR * 1000) * 100, 100);
    bar.style.width = pct + '%';
    if (pct < 100) progRAF = requestAnimationFrame(step);
  }
  progRAF = requestAnimationFrame(step);
}

/* ============================================
   网格构建（每个 Tab 一组卡片）
   ============================================ */
function buildGrids() {
  GRIDS.forEach((keys, gi) => {
    const grid = document.getElementById('grid' + gi);
    if (!grid) return;
    keys.forEach(key => {
      const s = SOUNDS[key];
      const el = document.createElement('div');
      el.className = 'sound-card';
      el.id = 'sc_' + key;
      // 用 rgba 转 cardc-soft
      const r = parseInt(s.color.slice(1, 3), 16);
      const g = parseInt(s.color.slice(3, 5), 16);
      const b = parseInt(s.color.slice(5, 7), 16);
      el.style.setProperty('--cardc', s.color);
      el.style.setProperty('--cardc-soft', `rgba(${r},${g},${b},0.12)`);
      el.innerHTML =
        `<div class="sc-name">${s.name}</div>` +
        `<span class="sc-subtype">${s.subtype}</span>` +
        `<div class="sc-eng">${s.eng}</div>` +
        `<div class="sc-desc">${s.desc}</div>` +
        `<button class="sc-play" id="sb_${key}" type="button">` +
        `<svg viewBox="0 0 13 13" fill="currentColor" width="11" height="11"><polygon points="2,1 11,6.5 2,12"/></svg>` +
        `<span class="label">播放</span></button>` +
        `<div class="sc-viz"><canvas id="sv_${key}"></canvas></div>` +
        `<div class="sc-prog-wrap"><div class="sc-prog" id="sp_${key}"></div></div>`;
      grid.appendChild(el);
      document.getElementById('sb_' + key).addEventListener('click', function () {
        play(this, key);
      });
    });
  });
}

/* ============================================
   Tab 切换
   ============================================ */
function switchAmbTab(i) {
  // 切换 Tab 时停止当前播放
  stopAll();
  document.querySelectorAll('.amb-tab').forEach(t => {
    t.classList.toggle('active', parseInt(t.dataset.tab) === i);
  });
  document.querySelectorAll('.amb-section').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.tab) === i);
  });
}

/* 初始化 */
window.addEventListener('DOMContentLoaded', buildGrids);
