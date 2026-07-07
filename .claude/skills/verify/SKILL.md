---
name: verify
description: Build/launch/drive recipe for verifying SonicTrance (static browser app) end-to-end with Playwright.
---

# Verifying SonicTrance

Static app, no build step. Surface is a browser GUI (canvas + Web Audio).

## Launch

```sh
(nohup python3 -m http.server 8931 >/tmp/server.log 2>&1 &)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8931/index.html   # expect 200
```

## Drive with Playwright

Playwright is globally installed; run scripts with
`NODE_PATH=/opt/node22/lib/node_modules node script.js`.
Chromium executable: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
(check `ls /opt/pw-browsers/` — the versioned dir name changes; the bare
`chromium` symlink dir has no `chrome-linux/chrome` inside).

Launch args that matter:
- `--autoplay-policy=no-user-gesture-required` — lets `player.play()` work after `setInputFiles`
- `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` — fake mic
  (tone) for the Microphone source AND auto-grants `getDisplayMedia` ("Fake audio")
  for the Capture source, so all three sources are drivable headless.

## Flows worth driving

1. **File source**: synthesize a WAV with a kick every 0.5s (python `wave` module),
   `page.setInputFiles('#file-input', wav)` — status should become "Playing: …",
   welcome overlay hides, `#player` visible and `.paused === false`.
2. **Modes**: keys `1`–`4` switch bars/radial/wave/particles; assert
   `#mode-select` value and sample canvas pixels (read `getImageData`, check
   fraction of pixels brighter than background > 0) — screenshots after ~2s
   of playback so beat effects show.
3. **Mic**: click `#btn-mic` with fake-device flags → status "Listening: Fake
   Default Audio Input", canvas animates.
4. **Stop**: `#btn-stop` → status resets, welcome returns, canvas litFrac ≈ 0.
5. Keyboard: `C` cycles theme select, `H` toggles `#hud.hidden`, `Esc` restores.

Collect `page.on('pageerror')` + console errors throughout; expect none.

## Gotchas

- Background processes started with plain `&` in the Bash tool die when the
  shell resets — use `(nohup … &)`.
- Canvas pixel sampling: `#viz` is sized by devicePixelRatio; read raw
  `canvas.width/height`, not CSS size.
- Particles mode is intentionally sparse right after switching; wait 3–4s
  (a few beat bursts) before screenshotting.
