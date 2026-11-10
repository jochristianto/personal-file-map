# The demo video

The loop at the top of the README: one page ([`index.html`](index.html)) that draws the app's own window and report, seeked frame by frame. Nothing here is part of the app or its build; generated files go to `out/` (git-ignored).

**Everything shown is the app's.** The labels, layout and colors come from `src/window.html` and `src/pdf.ts`; the numbers come from running the real app on a demo folder with a stand-in for the Claude API, so every figure (files, bills, due, missing, kWh, days, kWh a day, spent, tokens, cost) is one the app computed. The folder is `pnpm samples 2026 11` (with `BILLS_TODAY=2026-11-10`), with the samples' meter files swapped for the README's and FAQ's Home Meter example (`72.52 → 250.00 → 322.52`, the September photos dated by the `12 Sep 2026 18:40` payment). The API key is fake (`sk-ant-demo…`) and only its last 4 characters are ever shown.

## Make it

From this folder, after `pnpm install` in the repo root and `npm install` here (Playwright; it uses an installed Chromium if it finds one):

```bash
node demo/make-demo.mjs        # demo folder → out/motion-demo/, the app's figures → demo/facts.json, the report's pages as PNGs
node demo/snap-window.mjs      # screenshots of the real window on the demo folder, to compare against
node render.mjs --beats        # one frame per beat + out/motion/beats.png: check before the full render
node render.mjs                # the loop: 1858 frames, 4 subframes each blended for motion blur → out/motion/loop.mkv
python3 sound.py ../../out/motion/deep-urban.mp3 song-grid.json ../../out/motion/cues.json ../../out/motion/loop.wav
./finish.sh                    # loop.mp4 (1440², 60 fps, with sound) and demo.gif (1200 wide)
```

`sound.py` and `beats.py` need numpy (`python3 -m venv venv && venv/bin/pip install numpy`).

## How it moves

- **124 BPM, 16 bars, 64 beats, 30.97 s.** The song's tempo was measured with [`beats.py`](beats.py) (spectral flux, autocorrelation, a comb search to 0.01 BPM); [`song-grid.json`](song-grid.json) holds the window (bar 89, a phrase whose last bar is a fill that leads back into its own downbeat) and the measured transient of every beat. Each state starts on a downbeat; something changes on every beat.
- **Pure function of time.** `seek(t)` computes every style from `t`: no CSS transitions, timers or state between frames. Springs are closed-form step responses (damping 0.86–0.95, at most ~0.5 % overshoot); a value that changes target several times is the sum of one spring per change. Every track is periodic: the previous cycle's springs are summed in, so the last frame flows into the first, the cursor's position and speed included. Frame *N* would be frame 0 again, so it isn't rendered.
- **One shape.** The app icon, the window, the file name and the PDF page are one element changing size, radius and color; content swaps inside it with a short blur, each with its own in and out timing.
- **The selects' highlight** rides two springs, one per edge, the leading edge faster, so it stretches as it moves.
- **Sounds** (click, key, shortcut, toggle, shutter) are synthesized in `sound.py` and placed on the measured transient of their beat.

## The song

*Deep Urban* by Eugenio Mininni, from [Mixkit](https://mixkit.co/free-stock-music/house/), under the [Mixkit License](https://mixkit.co/license/#musicFree) (free to use in personal and commercial projects; see the license for the terms). It isn't in the repo: download it from Mixkit to `out/motion/deep-urban.mp3` (`https://assets.mixkit.co/music/623/623.mp3`).

## What the video leaves out

- The *Spent* card and the window's spending line also say `USD 0 a kWh`: the price per kWh is rounded to whole units, which is wrong for USD (it works for IDR). The video stops before that line.
- The report shows the demo's payment-only top-up (26 Aug) with an estimated 48.94 kWh: the app didn't read its `Payment Receipt` (100 kWh), although the FAQ says it would.
