# The motion reel

A 15-second piece for Personal File Map, cut like a motion designer's showreel: one page ([`index.html`](index.html)) seeked frame by frame, with synthesized sound design over the README demo's song. The README shows a silent GIF of it, [`docs/reel.gif`](../../reel.gif). Nothing here is part of the app or its build; generated files go to `out/showreel/` (git-ignored).

## Make it

From this folder, after the steps in [`../README.md`](../README.md) up to `node demo/make-demo.mjs` (the reel shows that run's report pages from `out/motion-demo/pages/`, and needs the song at `out/motion/deep-urban.mp3`):

```bash
node render.mjs --sheet       # one frame per beat → out/showreel/sheet.png: check before the full render
node render.mjs --at 7.74     # single frames, any number of times in seconds
node render.mjs               # 900 frames × 4 subframes, blended for motion blur → out/showreel/reel.mkv (~15 min)
python3 sound.py ../../../out/motion/deep-urban.mp3 ../../../out/showreel/reel.wav
node render.mjs --gif         # the GIF's cut: 15 fps, a 180° shutter, no grain or vignette → out/showreel/reel-gif.mkv (~4 min)
./finish.sh                   # out/showreel/reel.mp4 (1920×1080, 60 fps, with sound) and the README's docs/reel.gif
```

**The GIF** is 960 wide at 15 fps with one 128-colour palette and ordered (Bayer) dithering, about 8 MB. It's rendered without the film grain and vignette: GIF can only band or dither those, and dithered grain changes on every frame, which GIF compresses badly. The dithering keeps the dark background gradients from banding into rings.

Open `index.html?t=12.3` in Chrome (with `--allow-file-access-from-files`) to hold a frame, or without `?t` to play it live. `sound.py` needs numpy.

## The cut

123.997 BPM, 31 beats, 15.00 s. The music starts at bar 84 of the grid in [`../song-grid.json`](../song-grid.json), so the song's drum fill lands on the Paid / Due / Missing slams and the downbeat after it on the report. The music is cut on beat 28, the check badge, and rings out through a reverb.

| Beats | Scene | What moves |
|---|---|---|
| 0–4 | **Sort** | 72 of the demo folder's file names burst out of depth, then snap into a sorted list; a sweep lights each `YYYYMM`; the camera zooms into one name. |
| 4–8 | **Parse** | `202610 Home Meter #1 Before.jpg` splits into year, month, bill, top-up, photo and type. Everything falls away but the month, which opens the next scene as a circle wipe. |
| 8–13 | **Map** | The report's bill matrix, tilted in 3D and settling flat: checks cascade diagonally, the November column lights, due clocks spin in, the four missing months punch. |
| 13–16 | **Flag** | Paid 3/14, 11 due, 4 missing slam in as panels on the fill, then shrink into the report's card and pills. |
| 16–21 | **Report** | Page 1 builds itself (bars, 97 %, chips), the camera orbits, all six pages fan out, and the electricity page flies at the lens. |
| 21–27 | **Read** | A meter display: the AI scan and reticle read 72.52 kWh, the shutter rolls it to 322.52; the balance draws as a sawtooth with each top-up on a beat. |
| 27–31 | **Resolve** | The sawtooth morphs into the icon's receipt edge; the receipt, tile and check badge assemble; the name and tagline arrive. |

**Everything shown is the app's.** Colors, type and components come from `src/window.html`, `src/pdf.ts` and `scripts/icon.mjs`; numbers come from the README demo's run ([`../demo/facts.json`](../demo/facts.json), report pages 1, 2, 4 and 5): 178 files, 3 of 14 paid, 11 due, 4 missing, 97 % coverage, the five top-ups, 785 kWh, 7.7 kWh a day, USD 169.40, 18 photos read for USD 0.006, credit running out around 25 Nov. The report pages hide the footer's source path (the machine's) and the two *USD 0 a kWh* lines (see [What the video leaves out](../README.md#what-the-video-leaves-out)).

**How it moves.** Like the README demo: `seek(t)` computes every style from `t`, springs are closed-form step responses, and each frame blends 4 subframes (a 360° shutter) for motion blur. Monospace text uses SF Mono from `/System/Library/Fonts` (macOS), falling back to Menlo.
