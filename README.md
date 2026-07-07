# 🌀 SonicTrance

Real-time, interactive music visualization that runs **entirely in the browser** — no build step, no dependencies, no server-side anything. Audio is analyzed locally with the Web Audio API and never leaves your machine.

## Running it

It's a static page, so any file server works:

```sh
# from the repo root — pick whichever you have
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

> A server is needed (rather than double-clicking `index.html`) because microphone and screen-capture APIs require a secure context — `localhost` counts.

## Audio sources

| Source | What it picks up | Browser support |
|---|---|---|
| 🖥️ **Capture Tab / System** | Whatever is already playing — Spotify web, YouTube, another tab, or (on Windows/ChromeOS) the entire system's audio | Chrome & Edge. Pick a tab or screen in the dialog and check **“Share audio”** |
| 🎙️ **Microphone** | Any sound in the room — speakers, instruments, your voice | All modern browsers |
| 🎵 **Open File** | A local MP3/FLAC/WAV/OGG, played back with transport controls | All modern browsers |

Notes on capture mode:
- The share dialog **must** have its audio checkbox enabled, or the capture arrives silent (the app will tell you if that happens).
- Sharing a **tab** gives clean, direct audio. Sharing the **entire screen** on Windows/ChromeOS captures all system audio; macOS does not expose system audio to browsers, so use tab sharing or the microphone there.

## Visualizations

Four modes, switchable from the toolbar or the keyboard:

1. **Bars** — classic mirrored frequency spectrum with beat flashes
2. **Radial** — rotating circular spectrum with a pulsing core
3. **Waves** — layered oscilloscope with motion trails
4. **Particles** — swirling particle field that bursts on every beat

Beat detection is energy-based: bass-band spikes above the rolling average trigger the pulse/burst effects.

## Controls

| Key | Action |
|---|---|
| `1`–`4` | Switch visualization mode |
| `C` | Cycle color theme (Aurora / Sunset / Neon / Mono) |
| `F` | Toggle fullscreen |
| `H` | Hide/show the UI (Esc brings it back) |

## How it works

- All three sources feed a single `AnalyserNode` (`fftSize` 2048): mic and capture via `MediaStreamAudioSourceNode`, files via `MediaElementAudioSourceNode`.
- Each animation frame reads FFT magnitudes and the time-domain waveform, computes smoothed overall/bass energy, and runs beat detection.
- Visualizers are plain canvas-2D renderers in `visualizers.js`; adding a mode is a single function that receives `{ctx, w, h, freq, wave, energy, bass, beat, theme, time, dt}`.
