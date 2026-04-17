// Simple Web Audio retro/chiptune engine: looping 8-bit arcade BGM + death jingle.
// No network, no assets — purely synthesized with oscillators.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

let bgmTimer: number | null = null;
let bgmStep = 0;
let bgmEnabled = false;

// Simple catchy retro loop (C minor-ish, classic arcade vibe).
// Notes in Hz. 0 = rest.
const LEAD: number[] = [
  523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 523.25, 0,
  587.33, 698.46, 880.0, 1174.66, 880.0, 698.46, 587.33, 0,
  622.25, 783.99, 932.33, 1244.51, 932.33, 783.99, 622.25, 0,
  523.25, 659.25, 783.99, 1046.5, 1318.51, 1046.5, 783.99, 659.25,
];

const BASS: number[] = [
  130.81, 0, 196.0, 0, 130.81, 0, 196.0, 0,
  146.83, 0, 220.0, 0, 146.83, 0, 220.0, 0,
  155.56, 0, 233.08, 0, 155.56, 0, 233.08, 0,
  130.81, 0, 196.0, 0, 164.81, 0, 196.0, 0,
];

const STEP_MS = 140; // tempo

function ensureCtx() {
  if (!ctx) {
    const AC =
      (window.AudioContext as typeof AudioContext) ||
      ((window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext as typeof AudioContext);
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);
  }
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

function playBlip(
  freq: number,
  durationMs: number,
  type: OscillatorType,
  out: GainNode,
  volume = 0.3,
) {
  if (!ctx || !freq) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.connect(gain);
  gain.connect(out);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

export function startBgm() {
  const c = ensureCtx();
  if (!c || bgmEnabled) return;
  bgmEnabled = true;
  bgmStep = 0;

  const tick = () => {
    if (!bgmEnabled || !musicGain) return;
    const lead = LEAD[bgmStep % LEAD.length];
    const bass = BASS[bgmStep % BASS.length];
    if (lead) playBlip(lead, STEP_MS * 0.9, 'square', musicGain, 0.25);
    if (bass) playBlip(bass, STEP_MS * 1.4, 'triangle', musicGain, 0.35);
    // Hi-hat-ish noise on off-beats
    if (bgmStep % 2 === 1 && ctx && musicGain) {
      const bufferSize = 2 * ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const ng = ctx.createGain();
      ng.gain.value = 0.05;
      noise.connect(ng);
      ng.connect(musicGain);
      noise.start();
      noise.stop(ctx.currentTime + 0.05);
    }
    bgmStep++;
  };

  tick();
  bgmTimer = window.setInterval(tick, STEP_MS);
}

export function stopBgm() {
  bgmEnabled = false;
  if (bgmTimer !== null) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

export function playDeathSound() {
  const c = ensureCtx();
  if (!c || !sfxGain) return;
  // Classic descending arcade "you died" jingle
  const notes: { f: number; d: number; t: OscillatorType; delay: number }[] = [
    { f: 523.25, d: 140, t: 'square', delay: 0 },
    { f: 415.3, d: 140, t: 'square', delay: 140 },
    { f: 349.23, d: 180, t: 'square', delay: 280 },
    { f: 261.63, d: 260, t: 'square', delay: 460 },
    { f: 196.0, d: 420, t: 'sawtooth', delay: 720 },
  ];
  notes.forEach((n) => {
    setTimeout(() => playBlip(n.f, n.d, n.t, sfxGain!, 0.45), n.delay);
  });
  // Low noise thud
  setTimeout(() => {
    if (!ctx || !sfxGain) return;
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const ng = ctx.createGain();
    ng.gain.value = 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    noise.connect(filter);
    filter.connect(ng);
    ng.connect(sfxGain);
    noise.start();
    noise.stop(ctx.currentTime + 0.4);
  }, 0);
}

export function resumeAudio() {
  ensureCtx();
}

// Classic arcade "boing" jump sound — quick upward pitch sweep.
export function playJumpSound() {
  const c = ensureCtx();
  if (!c || !sfxGain || !ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(980, now + 0.12);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + 0.2);
}
