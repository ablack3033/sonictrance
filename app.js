/*
 * SonicTrance — audio engine + UI.
 * Routes one of three sources (tab/system capture, microphone, local file)
 * into a Web Audio AnalyserNode and drives the canvas visualizers.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('viz');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const welcome = document.getElementById('welcome');
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  const player = document.getElementById('player');
  const fileInput = document.getElementById('file-input');
  const modeSelect = document.getElementById('mode-select');
  const themeSelect = document.getElementById('theme-select');
  const btns = {
    capture: document.getElementById('btn-capture'),
    mic: document.getElementById('btn-mic'),
    file: document.getElementById('btn-file'),
    stop: document.getElementById('btn-stop'),
    fullscreen: document.getElementById('btn-fullscreen'),
  };

  /* ---------------- audio engine ---------------- */

  let audioCtx = null;
  let analyser = null;
  let freq, wave;
  let currentSource = null;   // { kind, node, stream? } of the active source
  let fileSourceNode = null;  // MediaElementSource can only be created once
  let rafId = 0;

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.82;
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Uint8Array(analyser.fftSize);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function stopSource() {
    if (!currentSource) return;
    const { kind, node, stream } = currentSource;
    try { node.disconnect(); } catch (e) { /* already gone */ }
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (kind === 'file') {
      player.pause();
      player.hidden = true;
    }
    currentSource = null;
    cancelAnimationFrame(rafId);
    rafId = 0;
    SonicViz.reset();
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setStatus('idle', 'Pick an audio source to begin');
    updateButtons(null);
    welcome.classList.remove('hidden');
  }

  function startWith(kind, node, stream) {
    stopSource();
    node.connect(analyser);
    if (kind === 'file') node.connect(audioCtx.destination); // hear the file
    currentSource = { kind, node, stream };
    if (stream) {
      // e.g. the user hits Chrome's "Stop sharing" bar or unplugs the mic
      stream.getTracks().forEach(t => t.addEventListener('ended', stopSource));
    }
    welcome.classList.add('hidden');
    updateButtons(kind);
    resetBeat();
    startTime = performance.now();
    lastFrame = startTime;
    rafId = requestAnimationFrame(loop);
  }

  async function useCapture() {
    ensureAudio();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // required by the API even though we only want audio
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach(t => t.stop());
        setStatus('error', 'No audio in that capture — pick a tab/screen and enable “Share audio”');
        return;
      }
      startWith('capture', audioCtx.createMediaStreamSource(stream), stream);
      const label = stream.getAudioTracks()[0].label || 'shared audio';
      setStatus('live', `Capturing: ${label}`);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        setStatus('error', `Capture failed: ${err.message}`);
      }
    }
  }

  async function useMic() {
    ensureAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      startWith('mic', audioCtx.createMediaStreamSource(stream), stream);
      setStatus('live', `Listening: ${stream.getAudioTracks()[0].label || 'microphone'}`);
    } catch (err) {
      setStatus('error', err.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : `Microphone failed: ${err.message}`);
    }
  }

  function useFile(file) {
    ensureAudio();
    if (player.src) URL.revokeObjectURL(player.src);
    player.src = URL.createObjectURL(file);
    if (!fileSourceNode) fileSourceNode = audioCtx.createMediaElementSource(player);
    startWith('file', fileSourceNode);
    player.hidden = false;
    player.play();
    setStatus('live', `Playing: ${file.name}`);
  }

  /* ---------------- beat detection ---------------- */

  // Energy-based: a beat is a bass-energy spike above the recent average.
  const HISTORY = 43; // ~0.7s of frames at 60fps
  let bassHist = [];
  let lastBeatAt = 0;
  let smoothEnergy = 0, smoothBass = 0;

  function resetBeat() {
    bassHist = [];
    lastBeatAt = 0;
    smoothEnergy = 0;
    smoothBass = 0;
  }

  function analyze(now) {
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);

    let total = 0;
    for (let i = 0; i < freq.length; i++) total += freq[i];
    const energy = total / (freq.length * 255);

    const bassBins = 12; // ~0..280 Hz at fftSize 2048 / 48kHz
    let b = 0;
    for (let i = 1; i <= bassBins; i++) b += freq[i];
    const bass = b / (bassBins * 255);

    smoothEnergy += (energy - smoothEnergy) * 0.1;
    smoothBass += (bass - smoothBass) * 0.15;

    bassHist.push(bass);
    if (bassHist.length > HISTORY) bassHist.shift();
    const avg = bassHist.reduce((a, v) => a + v, 0) / bassHist.length;

    let beat = false;
    if (bass > 0.12 && bass > avg * 1.4 && now - lastBeatAt > 180 && bassHist.length > 10) {
      beat = true;
      lastBeatAt = now;
    }
    return { energy: smoothEnergy, bass: smoothBass, beat };
  }

  /* ---------------- render loop ---------------- */

  let startTime = 0, lastFrame = 0;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    const { energy, bass, beat } = analyze(now);
    const mode = SonicViz.modes[modeSelect.value] || SonicViz.modes.radial;
    mode({
      ctx,
      w: canvas.width / dpr,
      h: canvas.height / dpr,
      freq, wave,
      energy, bass, beat,
      theme: SonicViz.THEMES[themeSelect.value] || SonicViz.THEMES.aurora,
      time: (now - startTime) / 1000,
      dt,
    });
  }

  /* ---------------- canvas sizing ---------------- */

  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------- UI ---------------- */

  function setStatus(state, text) {
    statusEl.className = state;
    statusText.textContent = text;
  }

  function updateButtons(activeKind) {
    btns.capture.classList.toggle('active', activeKind === 'capture');
    btns.mic.classList.toggle('active', activeKind === 'mic');
    btns.file.classList.toggle('active', activeKind === 'file');
    btns.stop.hidden = !activeKind;
  }

  btns.capture.addEventListener('click', useCapture);
  btns.mic.addEventListener('click', useMic);
  btns.file.addEventListener('click', () => fileInput.click());
  btns.stop.addEventListener('click', stopSource);
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) useFile(fileInput.files[0]);
    fileInput.value = '';
  });

  btns.fullscreen.addEventListener('click', toggleFullscreen);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  const modeKeys = { 1: 'bars', 2: 'radial', 3: 'wave', 4: 'particles' };
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (modeKeys[e.key]) {
      modeSelect.value = modeKeys[e.key];
      SonicViz.reset();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key === 'h' || e.key === 'H') {
      hud.classList.toggle('hidden');
    } else if (e.key === 'c' || e.key === 'C') {
      const opts = themeSelect.options;
      themeSelect.selectedIndex = (themeSelect.selectedIndex + 1) % opts.length;
    } else if (e.key === 'Escape' && hud.classList.contains('hidden')) {
      hud.classList.remove('hidden');
    }
  });

  // Hide capture button where getDisplayMedia audio isn't a thing (Safari/Firefox
  // expose the method but rarely deliver audio; keep it visible, they can still try).
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    btns.capture.hidden = true;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    btns.mic.hidden = true;
  }
})();
