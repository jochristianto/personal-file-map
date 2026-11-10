"""Beat grid of a song, with numpy only.

    python beats.py song.mp3            → tempo, beat phase and the strongest 32 s window
    python beats.py song.mp3 --json out → also writes the grid for render.mjs
    python beats.py song.mp3 --start-bar 89 --json out → the window starts at bar 89 instead

Onsets: spectral flux of a 2048/512 STFT at 22.05 kHz. Tempo: the autocorrelation peak of the
flux between 90 and 150 BPM, refined to 0.01 BPM by scoring a beat comb against the flux. Phase:
the comb offset with the most flux. Downbeat: of the four beat phases, the one with the most
low-band (kick) energy. Window: the 16-bar stretch, starting on a downbeat, with the steadiest
loud kick, so the loop doesn't start in an intro or a break.
"""
import json
import subprocess
import sys

import numpy as np

SR = 22050
HOP = 512


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def flux(x, lo=0, hi=None):
    n = 2048
    win = np.hanning(n).astype(np.float32)
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::HOP] * win
    mag = np.abs(np.fft.rfft(frames, axis=1))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    band = (freqs >= lo) & (freqs < (hi or SR))
    m = np.log1p(mag[:, band] * 10)
    d = np.maximum(0, np.diff(m, axis=0)).sum(axis=1)
    d = np.concatenate([[0], d])
    return d / (d.max() or 1)


def comb_score(env, period, phase):
    idx = np.arange(phase, len(env) - 1, period)
    i0 = np.floor(idx).astype(int)
    f = idx - i0
    return float(((1 - f) * env[i0] + f * env[i0 + 1]).mean())


def main():
    path = sys.argv[1]
    x = decode(path)
    env = flux(x)
    kick = flux(x, 30, 150)
    fps = SR / HOP

    # Tempo: autocorrelation, then a fine comb search
    e = env - env.mean()
    ac = np.correlate(e, e, "full")[len(e) - 1:]
    lags = np.arange(len(ac))
    bpm_of = lambda lag: 60 * fps / np.maximum(lag, 1e-9)
    ok = (bpm_of(lags) >= 90) & (bpm_of(lags) <= 150)
    lag = lags[ok][np.argmax(ac[ok])]
    coarse = bpm_of(lag)
    best = (0, coarse, 0)
    for bpm in np.arange(coarse - 2, coarse + 2, 0.01):
        period = 60 * fps / bpm
        for ph in np.linspace(0, period, 24, endpoint=False):
            s = comb_score(env, period, ph)
            if s > best[0]:
                best = (s, bpm, ph)
    _, bpm, ph = best
    period = 60 * fps / bpm
    # Refine the phase finely
    phs = np.linspace(ph - period / 8, ph + period / 8, 81)
    ph = phs[np.argmax([comb_score(env, period, p) for p in phs])] % period

    beats = np.arange(ph, len(env) - 1, period)  # in frames
    beat_t = beats / fps
    # Downbeat: which of the 4 beat phases carries the most kick
    kick_at = np.array([kick[int(round(b))] for b in beats])
    down = int(np.argmax([kick_at[k::4].mean() for k in range(4)]))

    # Window: 64 beats from a downbeat, loudest and steadiest kick
    rms = np.sqrt(np.convolve(x ** 2, np.ones(SR // 4) / (SR // 4), "same"))
    best_w = None
    for start in range(down, len(beat_t) - 64, 4):
        k = kick_at[start:start + 64]
        t0, t1 = beat_t[start], beat_t[start + 63] + 60 / bpm
        loud = rms[int(t0 * SR):int(t1 * SR)].mean()
        score = loud * (k.mean() - 0.5 * k.std())
        if best_w is None or score > best_w[0]:
            best_w = (score, start)
    start = best_w[1]
    if "--start-bar" in sys.argv:  # a phrase you picked by ear: bar N counted from the first downbeat
        start = down + 4 * (int(sys.argv[sys.argv.index("--start-bar") + 1]) - 1)
    print(f"{path}: {bpm:.2f} BPM, first beat {beat_t[0]:.3f} s, downbeat phase {down}, "
          f"beats {len(beat_t)}, best 16-bar window starts at beat {start} = {beat_t[start]:.3f} s")
    print("kick strength per beat in the window (bar per line):")
    for b in range(16):
        k = kick_at[start + b * 4:start + b * 4 + 4]
        print(f"  bar {b + 1:2d}  " + "  ".join(f"{v:.2f}" for v in k))

    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        # Measured onset peak near each beat of the window (for placing UI sounds on the real transient)
        peaks = []
        for b in range(64 + 1):
            c = beats[start + b] if start + b < len(beats) else beats[start] + (b * period)
            lo, hi = int(c - period / 4), int(c + period / 4)
            i = lo + int(np.argmax(env[lo:hi]))
            peaks.append(round(i / fps, 4))
        json.dump({"file": path, "bpm": round(bpm, 3), "start": round(float(beat_t[start]), 4),
                   "beat": round(60 / bpm, 5), "peaks": peaks}, open(out, "w"), indent=1)
        print("wrote", out)


if __name__ == "__main__":
    main()
