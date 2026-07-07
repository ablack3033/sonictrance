# 🌀 SonicTrance

**Real-time, interactive music visualization that runs entirely in your browser.**

SonicTrance turns whatever you're listening to into full-screen animated visuals. Point it at a playing browser tab (Spotify web, YouTube…), your microphone, or a local audio file, and it renders beat-reactive graphics live on a canvas — no build step, no dependencies, no server-side anything. Audio is analyzed locally with the Web Audio API and **never leaves your machine**.

![Radial mode](https://img.shields.io/badge/deps-zero-brightgreen) ![Static](https://img.shields.io/badge/build-none-blue)

## What it does

- **Listens** to one of three audio sources (see table below)
- **Analyzes** the sound ~60 times a second: FFT spectrum, waveform, smoothed loudness, and energy-based beat detection (bass spikes above the rolling average)
- **Renders** one of four visualization modes, each reacting to the spectrum and pulsing/bursting on every beat:
  1. **Bars** — classic mirrored frequency spectrum with beat flashes
  2. **Radial** — rotating circular spectrum around a pulsing core
  3. **Waves** — layered oscilloscope with motion trails
  4. **Particles** — swirling comet field that erupts on each beat
- **Themes**: Aurora, Sunset, Neon, Mono — cycle with one key

## Try it out

It's a static page; any file server works. From the repo root:

```sh
python3 -m http.server 8000     # or: npx serve .
```

Open <http://localhost:8000>, then:

1. Start some music playing in another browser tab (or on your speakers).
2. Click **🖥️ Capture Tab / System**, pick the tab that's playing, and check **“Share audio”** in the dialog — or click **🎙️ Microphone** / **🎵 Open File**.
3. Hit `F` for fullscreen and `H` to hide the UI. Enjoy.

> A server is needed (rather than double-clicking `index.html`) because microphone and screen-capture APIs require a secure context — `localhost` counts, plain `file://` doesn't.

### Audio sources

| Source | What it picks up | Browser support |
|---|---|---|
| 🖥️ **Capture Tab / System** | Whatever is already playing — another tab, or (on Windows/ChromeOS) the entire system's audio | Chrome & Edge. Check **“Share audio”** in the picker |
| 🎙️ **Microphone** | Any sound in the room — speakers, instruments, your voice | All modern browsers |
| 🎵 **Open File** | A local MP3/FLAC/WAV/OGG, with playback controls | All modern browsers |

Capture-mode notes:
- If the share dialog's audio checkbox is left unchecked, the capture arrives silent — the app detects this and tells you.
- Sharing a **tab** gives clean, direct audio. Sharing the **entire screen** captures all system audio on Windows/ChromeOS; macOS doesn't expose system audio to browsers, so use tab sharing or the microphone there.

### Controls

| Key | Action |
|---|---|
| `1`–`4` | Switch visualization mode (Bars / Radial / Waves / Particles) |
| `C` | Cycle color theme |
| `F` | Toggle fullscreen |
| `H` | Hide/show the UI (`Esc` brings it back) |

## Deploying it

The whole app is five static files — it deploys to any static host in a minute. The only requirement is **HTTPS** (the mic and screen-capture APIs refuse to run on insecure origins), which every option below provides automatically.

### GitHub Pages

From the repo on GitHub: **Settings → Pages → Source: “Deploy from a branch”**, pick `main` and `/ (root)`, save. A minute later the app is live at:

```
https://<your-username>.github.io/sonictrance/
```

### Netlify / Vercel / Cloudflare Pages

Import the repo in any of their dashboards and accept the defaults — no build command, publish directory is the repo root. Or from the CLI:

```sh
npx netlify-cli deploy --prod --dir .     # Netlify
npx vercel --prod                         # Vercel
npx wrangler pages deploy .               # Cloudflare Pages
```

### Any web server

Copy `index.html`, `style.css`, `app.js`, and `visualizers.js` to any HTTPS-served directory (nginx, Apache, S3+CloudFront…). There is nothing to build and no server-side code.

## How it works

- All three sources feed a single `AnalyserNode` (`fftSize` 2048): mic and capture via `MediaStreamAudioSourceNode`, files via `MediaElementAudioSourceNode`.
- Each animation frame reads FFT magnitudes and the time-domain waveform, computes smoothed overall/bass energy, and runs beat detection (a bass-band spike above ~1.4× the rolling average, with a refractory period).
- Visualizers are plain canvas-2D renderers in `visualizers.js`. Adding a mode is one function that receives `{ctx, w, h, freq, wave, energy, bass, beat, theme, time, dt}` — register it in the `modes` object and add an `<option>` in `index.html`.

```
index.html       page shell + toolbar/HUD
style.css        dark glassy UI styling
app.js           audio engine, sources, beat detection, render loop, keyboard/UI
visualizers.js   the four render modes + color themes
```

## Privacy

Everything runs client-side. Captured audio is analyzed in-memory for visualization and is never recorded, stored, or transmitted anywhere.
