const $ = (selector) => document.querySelector(selector);
const worlds = [
  { name: 'Earth after dark', code: 'TERRA', mood: 'WARM / UNHURRIED', description: 'Warm keys. Soft gravity. Nowhere to be.', tempo: 86, key: 'A MINOR', root: 45, scale: [0, 3, 7, 10, 12, 15, 19], color: '#d5f78a', glow: '#426e50', bg: '#0b1916', wave: 'sine', pattern: ['1001001010010010', '1000000010000000', '1000001000100000', '0010001000100010'] },
  { name: 'Velvet moon', code: 'LUNAR', mood: 'DREAMY / WEIGHTLESS', description: 'Midnight thoughts, in a softer light.', tempo: 72, key: 'D MINOR', root: 50, scale: [0, 3, 5, 7, 10, 12, 15], color: '#c4b4f2', glow: '#656091', bg: '#141321', wave: 'sine', pattern: ['1000001001000010', '1000000000100000', '1000000010000000', '0000100000001000'] },
  { name: 'Solar bloom', code: 'SOLAR', mood: 'BRIGHT / RESTLESS', description: 'A little heat. A new kind of energy.', tempo: 112, key: 'C MAJOR', root: 48, scale: [0, 4, 7, 9, 12, 16, 19], color: '#ffba80', glow: '#986741', bg: '#20150f', wave: 'triangle', pattern: ['1010010110100101', '1000100010001000', '1001000010100010', '1010101010101010'] },
  { name: 'Deep blue', code: 'OCEAN', mood: 'SLOW / SUBMERGED', description: 'Below the noise, there’s a quieter place.', tempo: 62, key: 'E MINOR', root: 40, scale: [0, 3, 7, 10, 12, 15, 19], color: '#91d8e8', glow: '#377f91', bg: '#0a1820', wave: 'sine', pattern: ['1000000100100000', '1000000000001000', '1000000010000000', '0000001000000010'] },
];
const voiceNames = ['KEYS', 'PAD', 'BASS', 'DUST'];
const voiceColors = ['#d5f78a', '#b6b0ea', '#efa982', '#8fc6c6'];
const storageKey = 'orbital-session-v1';
const fresh = (world = 0) => ({ version: 1, world, tempo: worlds[world].tempo, space: 65, volume: 70, pattern: worlds[world].pattern.map(row => [...row].map(Number)), muted: [false, false, false, false] });
let state = fresh();
let playing = false, currentStep = -1, nextStep = 0, nextTime = 0, timer, audio, master, compressor, delay, feedback, wet, reverb, reverbGain;
let visualEvents = [], pulse = 0, toastTimer;
let motionPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let sharedLoaded = false;

function validState(value) {
  return value && value.version === 1 && Number.isInteger(value.world) && value.world >= 0 && value.world < 4
    && Number.isInteger(value.tempo) && value.tempo >= 55 && value.tempo <= 140
    && Number.isInteger(value.space) && value.space >= 0 && value.space <= 100
    && Number.isInteger(value.volume) && value.volume >= 0 && value.volume <= 100
    && Array.isArray(value.pattern) && value.pattern.length === 4 && value.pattern.every(row => Array.isArray(row) && row.length === 16 && row.every(n => n === 0 || n === 1))
    && Array.isArray(value.muted) && value.muted.length === 4 && value.muted.every(n => typeof n === 'boolean');
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); $('#session-indicator').textContent = 'SAVED ON THIS DEVICE'; }
  catch { $('#session-indicator').textContent = 'UNSAVED SESSION'; }
  // An edited shared loop gets a fresh link only when explicitly shared again.
  if (location.hash.startsWith('#loop=')) history.replaceState(null, '', location.pathname + location.search);
}
try {
  const hash = location.hash;
  if (hash.startsWith('#loop=')) {
    if (hash.length > 3000) throw new Error('Link too long');
    const value = JSON.parse(atob(hash.slice(6).replace(/-/g, '+').replace(/_/g, '/')));
    if (!validState(value)) throw new Error('Invalid loop');
    state = value; sharedLoaded = true;
  } else {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (validState(value)) state = value;
  }
} catch { toast('A fresh orbit is ready. That saved loop couldn’t be loaded.'); }

$('#step-counts').innerHTML = Array.from({ length: 16 }, (_, i) => `<span>${i % 4 === 0 ? String(i + 1).padStart(2, '0') : '·'}</span>`).join('');
$('#sequencer').innerHTML = voiceNames.map((name, row) => `<div class="voice-row" style="--voice:${voiceColors[row]}"><button class="voice-label" data-voice="${row}" aria-label="Mute ${name.toLowerCase()}" aria-pressed="false">${name}</button><div class="steps">${Array.from({ length: 16 }, (_, step) => `<button class="step" data-row="${row}" data-step="${step}" aria-label="${name.toLowerCase()}, step ${step + 1}" aria-pressed="false"></button>`).join('')}</div></div>`).join('');
$('#world-grid').innerHTML = worlds.map((world, i) => `<button class="world-card" data-world="${i}" aria-pressed="false"><span class="world-art" style="--planet:${world.color}" aria-hidden="true"></span><span class="world-info"><strong>${world.name}</strong><small>${world.mood}</small></span><span class="world-check" aria-hidden="true">↗</span></button>`).join('');
const stepButtons = [...document.querySelectorAll('.step')];
const voiceButtons = [...document.querySelectorAll('.voice-label')];
const worldButtons = [...document.querySelectorAll('.world-card')];
function render() {
  const world = worlds[state.world];
  $('#scene-name').textContent = world.name;
  $('#scene-description').textContent = world.description;
  $('#scene-number').textContent = `0${state.world + 1} / 04`;
  $('#world-code').textContent = world.code;
  $('#key-label').textContent = world.key;
  for (const prop of ['tempo', 'space', 'volume']) {
    $(`#${prop}`).value = state[prop];
    $(`#${prop}-value`).textContent = state[prop] + (prop === 'tempo' ? '' : '%');
  }
  stepButtons.forEach(button => button.setAttribute('aria-pressed', String(!!state.pattern[Number(button.dataset.row)][Number(button.dataset.step)])));
  voiceButtons.forEach((button, row) => {
    button.setAttribute('aria-pressed', String(state.muted[row]));
    button.setAttribute('aria-label', `${state.muted[row] ? 'Unmute' : 'Mute'} ${voiceNames[row].toLowerCase()}`);
    button.parentElement.classList.toggle('muted', state.muted[row]);
  });
  worldButtons.forEach((button, i) => {
    button.setAttribute('aria-pressed', String(i === state.world));
    button.querySelector('.world-check').textContent = i === state.world ? '✓' : '↗';
  });
  drawUniverse(performance.now());
}
$('#sequencer').addEventListener('click', event => {
  const step = event.target.closest('.step');
  const voice = event.target.closest('.voice-label');
  if (step) {
    const row = Number(step.dataset.row), col = Number(step.dataset.step);
    state.pattern[row][col] ^= 1;
    pulse = .5;
  } else if (voice) state.muted[Number(voice.dataset.voice)] = !state.muted[Number(voice.dataset.voice)];
  else return;
  render(); save();
});
$('#world-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-world]');
  if (!button) return;
  const wasPlaying = playing;
  if (wasPlaying) stop();
  const volume = state.volume;
  state = fresh(Number(button.dataset.world)); state.volume = volume;
  render(); save(); updateAudio();
  if (wasPlaying) start();
});
for (const prop of ['tempo', 'space', 'volume']) $(`#${prop}`).addEventListener('input', event => {
  state[prop] = Number(event.target.value);
  $(`#${prop}-value`).textContent = state[prop] + (prop === 'tempo' ? '' : '%');
  updateAudio(); save();
});
$('#reset').addEventListener('click', () => {
  const wasPlaying = playing;
  if (wasPlaying) stop();
  const volume = state.volume;
  state = fresh(state.world); state.volume = volume;
  render(); save(); updateAudio();
  if (wasPlaying) start();
  toast('Back to the beginning. Take a different turn.');
});
$('#shuffle').addEventListener('click', () => {
  state.pattern = voiceNames.map((_, row) => Array.from({ length: 16 }, (_, step) => Number(Math.random() < (row === 0 ? .33 : row === 1 ? (step % 4 === 0 ? .7 : 0) : row === 2 ? (step % 4 === 0 ? .65 : .08) : (step % 2 === 0 ? .5 : .08)))));
  state.pattern[0][0] = 1; state.pattern[1][0] = 1; state.pattern[2][0] = 1;
  pulse = 1; render(); save(); toast('A new little constellation.');
});
$('#share').addEventListener('click', async () => {
  const encoded = btoa(JSON.stringify(state)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = new URL(location.href); url.hash = `loop=${encoded}`;
  try { await navigator.clipboard.writeText(url.href); toast('Your loop link is copied. Send it into the universe.'); }
  catch { history.replaceState(null, '', url); toast('Your loop is in the address bar. Copy the URL to share.'); }
});
function openHelp() { $('#help').showModal(); }
$('#help-open').addEventListener('click', openHelp);
$('#help-close').addEventListener('click', () => $('#help').close());
$('#help-done').addEventListener('click', () => $('#help').close());
$('#help').addEventListener('click', event => { if (event.target === $('#help')) { const r = $('#help').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#help').close(); } });
$('#motion').setAttribute('aria-pressed', String(motionPaused));
$('#motion').textContent = motionPaused ? 'Resume visuals' : 'Pause visuals';
$('#motion').addEventListener('click', () => { motionPaused = !motionPaused; $('#motion').setAttribute('aria-pressed', String(motionPaused)); $('#motion').textContent = motionPaused ? 'Resume visuals' : 'Pause visuals'; });

// All sound is synthesized locally; no samples, tracking, or remote audio.
function createAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('Web Audio unavailable');
  audio = new AudioContext();
  master = audio.createGain(); master.gain.value = 0;
  compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -15; compressor.knee.value = 20; compressor.ratio.value = 5;
  compressor.attack.value = .005; compressor.release.value = .3;
  master.connect(compressor); compressor.connect(audio.destination);
  delay = audio.createDelay(2); feedback = audio.createGain(); wet = audio.createGain();
  delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(master);
  reverb = audio.createConvolver(); reverbGain = audio.createGain();
  const impulse = audio.createBuffer(2, audio.sampleRate * 2.5, audio.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  }
  reverb.buffer = impulse; reverb.connect(reverbGain); reverbGain.connect(master);
  updateAudio();
}
function updateAudio() {
  if (!audio) return;
  const time = audio.currentTime;
  master.gain.setTargetAtTime(playing ? state.volume / 100 * .65 : 0, time, .045);
  delay.delayTime.setTargetAtTime(60 / state.tempo * .75, time, .08);
  feedback.gain.setTargetAtTime(.15 + state.space / 100 * .35, time, .05);
  wet.gain.setTargetAtTime(state.space / 100 * .3, time, .05);
  reverbGain.gain.setTargetAtTime(state.space / 100 * .48, time, .05);
}
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
function tone(midi, time, duration, gain, type = 'sine', pan = 0, lowpass = 7000) {
  const oscillator = audio.createOscillator(), envelope = audio.createGain(), filter = audio.createBiquadFilter(), panner = audio.createStereoPanner();
  oscillator.type = type; oscillator.frequency.value = hz(midi);
  filter.type = 'lowpass'; filter.frequency.value = lowpass;
  panner.pan.value = pan;
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(gain, time + .025);
  envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
  oscillator.connect(filter); filter.connect(envelope); envelope.connect(panner);
  panner.connect(master); panner.connect(delay); panner.connect(reverb);
  oscillator.start(time); oscillator.stop(time + duration + .02);
  oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); envelope.disconnect(); panner.disconnect(); };
}
let noiseBuffer;
function dust(time, strong) {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * .12), audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), envelope = audio.createGain();
  source.buffer = noiseBuffer; filter.type = 'highpass'; filter.frequency.value = 5500;
  envelope.gain.setValueAtTime(strong ? .075 : .04, time); envelope.gain.exponentialRampToValueAtTime(.0001, time + .075);
  source.connect(filter); filter.connect(envelope); envelope.connect(master); envelope.connect(reverb);
  source.start(time); source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
}
function scheduleStep(step, time) {
  const world = worlds[state.world], beat = 60 / state.tempo;
  let intensity = 0;
  for (let row = 0; row < 4; row++) {
    if (!state.pattern[row][step] || state.muted[row]) continue;
    intensity += .25;
    if (row === 0) {
      const degree = [0, 4, 2, 1, 3, 2, 4, 6, 2, 1, 5, 3, 4, 2, 1, 3][step];
      tone(world.root + 12 + world.scale[degree], time, beat * 1.9, .14, world.wave, Math.sin(step * 2) * .45, 3800);
    } else if (row === 1) {
      [0, world.scale[1], 7, 12].forEach((offset, i) => tone(world.root + offset, time, beat * 3.5, .045, 'triangle', (i - 1.5) * .25, 1100));
    } else if (row === 2) tone(world.root - 12 + (step >= 8 ? 7 : 0), time, beat * .9, .25, 'sine', 0, 600);
    else dust(time, step % 4 === 2);
  }
  visualEvents.push({ step, time, intensity });
}
function scheduler() {
  if (!playing) return;
  if (nextTime < audio.currentTime - .2) nextTime = audio.currentTime + .02;
  while (nextTime < audio.currentTime + .12) {
    scheduleStep(nextStep, nextTime);
    nextTime += 60 / state.tempo / 4;
    nextStep = (nextStep + 1) % 16;
  }
}
let starting = false;
async function start() {
  if (playing || starting) return;
  starting = true;
  try {
    if (!audio) createAudio();
    await audio.resume();
    if (audio.state !== 'running') throw new Error('Audio could not start');
    playing = true; nextStep = 0; nextTime = audio.currentTime + .045; visualEvents = [];
    updateAudio(); scheduler(); timer = setInterval(scheduler, 25);
    $('#play-icon').textContent = 'Ⅱ'; $('#play').setAttribute('aria-label', 'Pause sound');
    $('#play-label').textContent = 'You’re in your own orbit.'; $('#play-hint').textContent = 'Keep going. See where it takes you.';
    $('#universe-state').textContent = 'IN ORBIT';
  } catch { toast('Sound couldn’t start. Try a browser with Web Audio support.'); }
  finally { starting = false; }
}
function stop() {
  playing = false; clearInterval(timer); visualEvents = []; currentStep = -1;
  updateAudio(); stepButtons.forEach(button => button.classList.remove('current'));
  $('#play-icon').textContent = '▶'; $('#play').setAttribute('aria-label', 'Start sound');
  $('#play-label').textContent = 'Find your frequency.'; $('#play-hint').textContent = 'Press play. Leave the world behind.';
  $('#universe-state').textContent = 'READY TO DRIFT';
}
$('#play').addEventListener('click', () => playing ? stop() : start());
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || $('#help').open || event.target.closest('button,input,a,textarea,select,[contenteditable]')) return;
  event.preventDefault(); playing ? stop() : start();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stop(); });

// A deterministic particle sculpture, drawn with Canvas 2D.
const canvas = $('#universe'), ctx = canvas.getContext('2d');
let width = 600, height = 466, lastFrame = 0, visualTime = 0;
let seed = 913;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const stars = Array.from({ length: 110 }, () => ({ x: random(), y: random(), size: random() * 1.1 + .25, alpha: random() * .5 + .1 }));
const particles = Array.from({ length: 1300 }, () => ({ angle: random() * Math.PI * 2, radius: .85 + random() * .73, lift: (random() - .5) * .12, size: random() * 1.35 + .25, opacity: random() * .6 + .2 }));
const spherePoints = Array.from({ length: 1500 }, () => { const y = random() * 2 - 1, theta = random() * Math.PI * 2, r = Math.sqrt(1 - y * y); return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r, size: random() * 1.1 + .15 }; });
function resize() {
  const bounds = canvas.getBoundingClientRect(); width = bounds.width; height = bounds.height;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); drawUniverse(performance.now());
}
function drawUniverse() {
  if (!ctx || !width || !height) return;
  const world = worlds[state.world], t = visualTime * .00006, cx = width * .52, cy = height * .46, radius = Math.min(width * .21, height * .27);
  ctx.globalAlpha = 1; ctx.fillStyle = world.bg; ctx.fillRect(0, 0, width, height);
  const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.5);
  ambient.addColorStop(0, world.glow + '40'); ambient.addColorStop(.55, world.glow + '17'); ambient.addColorStop(1, world.bg + '00');
  ctx.fillStyle = ambient; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = world.color + '07'; ctx.lineWidth = .6;
  for (let x = 20; x < width; x += 38) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 20; y < height; y += 38) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  for (const star of stars) { ctx.globalAlpha = star.alpha * (.7 + Math.sin(t * 5 + star.x * 100) * .3); ctx.fillStyle = '#e3f0df'; ctx.fillRect(star.x * width, star.y * height, star.size, star.size); }
  ctx.globalAlpha = 1;
  // Thin diagram guides give the organic sculpture a precise, instrument-like frame.
  ctx.strokeStyle = world.color + '18'; ctx.lineWidth = .7;
  ctx.beginPath(); ctx.arc(cx, cy, radius * 1.67, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([2, 8]); ctx.beginPath(); ctx.arc(cx, cy, radius * 1.82, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2; const x = cx + Math.cos(angle) * radius * 1.82, y = cy + Math.sin(angle) * radius * 1.82;
    ctx.strokeStyle = world.color + '55'; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
  }
  const ring = (front) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.39);
    for (const p of particles) {
      const angle = p.angle + t * .5, z = Math.sin(angle);
      if ((z > 0) !== front) continue;
      const x = Math.cos(angle) * radius * p.radius * 1.35, y = z * radius * p.radius * .43 + p.lift * radius;
      ctx.globalAlpha = p.opacity * (front ? .9 : .45);
      ctx.fillStyle = world.color; ctx.beginPath(); ctx.arc(x, y, p.size * (1 + pulse * .2), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
  ring(false);
  const body = ctx.createRadialGradient(cx - radius * .36, cy - radius * .38, radius * .04, cx, cy, radius);
  body.addColorStop(0, world.glow); body.addColorStop(.5, world.glow + 'ba'); body.addColorStop(.88, world.bg); body.addColorStop(1, '#07110e');
  ctx.globalAlpha = 1; ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
  for (const p of spherePoints) {
    const x = p.x * Math.cos(t) + p.z * Math.sin(t), z = -p.x * Math.sin(t) + p.z * Math.cos(t);
    if (z < 0) continue;
    const light = Math.max(.03, (-x * .35 - p.y * .5 + z * .4 + .1));
    const bands = .55 + Math.sin(p.y * 30 + x * 5 + t) * .35;
    ctx.fillStyle = world.color; ctx.globalAlpha = light * bands * .8;
    ctx.fillRect(cx + x * radius, cy + p.y * radius, p.size, p.size);
  }
  ctx.restore();
  ctx.globalAlpha = .3 + pulse * .2; ctx.strokeStyle = world.color; ctx.lineWidth = .7; ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI * .87, Math.PI * 1.82); ctx.stroke(); ctx.globalAlpha = 1;
  ring(true);
  const satelliteAngle = t * 1.7 - .6, satelliteX = cx + Math.cos(satelliteAngle) * radius * 1.67, satelliteY = cy + Math.sin(satelliteAngle) * radius * 1.67;
  const light = ctx.createRadialGradient(satelliteX, satelliteY, 0, satelliteX, satelliteY, 13 + pulse * 8);
  light.addColorStop(0, world.color + '88'); light.addColorStop(1, world.color + '00');
  ctx.globalAlpha = 1; ctx.fillStyle = light; ctx.beginPath(); ctx.arc(satelliteX, satelliteY, 13 + pulse * 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f5ffdf'; ctx.beginPath(); ctx.arc(satelliteX, satelliteY, 2.5, 0, Math.PI * 2); ctx.fill();
  const shade = ctx.createLinearGradient(0, height * .64, 0, height); shade.addColorStop(0, world.bg + '00'); shade.addColorStop(1, world.bg + 'e8'); ctx.fillStyle = shade; ctx.fillRect(0, height * .64, width, height * .36);
}
function frame(time) {
  const delta = Math.min(time - lastFrame, 60); lastFrame = time;
  if (!motionPaused) visualTime += delta;
  if (playing && audio) {
    while (visualEvents.length && visualEvents[0].time <= audio.currentTime) {
      const event = visualEvents.shift(); currentStep = event.step; pulse = event.intensity;
      stepButtons.forEach(button => button.classList.toggle('current', Number(button.dataset.step) === currentStep));
    }
  }
  pulse *= .93;
  if (!motionPaused && !document.hidden) drawUniverse(time);
  requestAnimationFrame(frame);
}
$('#save-art').addEventListener('click', () => {
  const image = document.createElement('canvas'); image.width = 1600; image.height = 1400;
  const context = image.getContext('2d'); context.fillStyle = worlds[state.world].bg; context.fillRect(0, 0, 1600, 1400);
  const scale = Math.min(1600 / canvas.width, 1150 / canvas.height), w = canvas.width * scale, h = canvas.height * scale;
  context.drawImage(canvas, (1600 - w) / 2, (1150 - h) / 2, w, h);
  context.fillStyle = '#edf4e6'; context.font = '48px sans-serif'; context.fillText(worlds[state.world].name, 100, 1220);
  context.fillStyle = worlds[state.world].color; context.font = '20px sans-serif'; context.fillText(`ORBITAL / ${state.tempo} BPM / ${worlds[state.world].key}`, 100, 1275);
  image.toBlob(blob => {
    if (!blob) { toast('The image couldn’t be saved. Please try again.'); return; }
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `orbital-${worlds[state.world].code.toLowerCase()}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('A small piece of your universe, saved.');
  }, 'image/png');
});
new ResizeObserver(resize).observe(canvas);
render(); resize(); requestAnimationFrame(frame);
if (sharedLoaded) { $('#session-indicator').textContent = 'SHARED LOOP LOADED'; toast('Someone sent you a little universe. Press play.'); }
