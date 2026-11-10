"""The reel's audio: 28 beats of the song, cut on the logo hit, plus synthesized sound design on the beat grid.

    python sound.py song.mp3 out.wav

The song is Deep Urban (Mixkit), from bar 84 of the grid measured by ../beats.py (../song-grid.json):
a peak section whose bar 4 is a drum fill, so the fill lands on the reel's Paid / Due / Missing slams (beats
13-15) and the downbeat after it on the report (beat 16). The music is cut on beat 28 (the check badge) and
left to ring out through a synthetic reverb. Every effect is synthesized here (no samples) and placed in beats,
on the same grid as index.html (123.997 BPM). Needs numpy.
"""
import subprocess
import sys
import wave

import numpy as np

SR = 48000
BPM = 123.997
B = 60 / BPM
T = 15.0
SONG_START = 170.9937 - 16 * 0.48388  # bar 84 of song-grid.json
CUT = 28  # beat
rng = np.random.default_rng(3)


def b(n):
    return n * B


def decode(path, start, dur):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.4f}", "-t", f"{dur:.4f}", "-i", path,
                          "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(n):
    return rng.standard_normal(n)


def onepole(x, cut):
    """Low-pass with a per-sample cutoff (Hz): a one-pole filter run in blocks."""
    cut = np.broadcast_to(cut, x.shape)
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def bandpass(x, lo, hi):
    f = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    f[(fr < lo) | (fr > hi)] = 0
    return np.fft.irfft(f, len(x))


def norm(x, peak=1.0):
    m = np.abs(x).max()
    return x * (peak / m) if m else x


# ── sounds ──
def boom(d=1.2, f0=95, f1=36, crack=0.6):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.09)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.45) * np.minimum(1, t / 0.003)
    n = noise(len(t))
    hit = onepole(n, 2500) * np.exp(-t / 0.03) * 3
    air = bandpass(n, 3000, 12000) * np.exp(-t / 0.012) * crack
    return norm(np.tanh(1.6 * body + hit + air))


def whoosh(d=0.6, lo=300, hi=6000, rise=0.7, up=True):
    t = tt(d)
    x = t / d
    env = np.where(x < rise, (x / rise) ** 2.2, np.exp(-(x - rise) / (1 - rise) * 5))
    cut = lo + (hi - lo) * (x if up else 1 - x) ** 1.5
    n = noise(len(t))
    y = onepole(n, cut) - 0.6 * onepole(n, cut * 0.25)
    return norm(y * env)


def riser(d, lo=200, hi=7000):
    t = tt(d)
    x = t / d
    n = noise(len(t))
    y = onepole(n, lo + (hi - lo) * x ** 2) * x ** 3
    f = 220 * 2 ** (2 * x)
    y += 0.3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * x ** 2
    return norm(y)


def tick(f=2000, d=0.05, decay=0.008, noise_amt=0.4):
    t = tt(d)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / decay)
    y += noise_amt * bandpass(noise(len(t)), f * 0.8, min(f * 4, 20000)) * np.exp(-t / (decay * 0.4))
    return norm(y)


def tock(f=900):
    t = tt(0.08)
    return norm(np.sin(2 * np.pi * f * t * (1 + 0.4 * np.exp(-t / 0.004))) * np.exp(-t / 0.018))


def punch(f0=160, f1=55, d=0.32):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09)
    y += 0.5 * onepole(noise(len(t)), 3000) * np.exp(-t / 0.01)
    return norm(np.tanh(2 * y))


def chime(freqs, d=1.2, decay=0.35, bright=0.35):
    t = tt(d)
    y = np.zeros(len(t))
    for f in freqs:
        y += np.sin(2 * np.pi * f * t) * np.exp(-t / decay)
        y += bright * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (decay * 0.4))
        y += 0.12 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / (decay * 0.2))
    return norm(y * np.minimum(1, t / 0.002))


def shutter():
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    x = 0.6 * bandpass(noise(n), 1200, 7000) * np.exp(-t / 0.01)
    k = int(0.06 * SR)
    x[k:] += 0.45 * bandpass(noise(n - k), 900, 6000) * np.exp(-t[: n - k] / 0.014)
    return norm(x)


def sweep(d, f0, f1):
    t = tt(d)
    x = t / d
    f = f0 * (f1 / f0) ** x
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x) ** 1.5
    y += 0.3 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * np.sin(np.pi * x) ** 3
    return norm(y)


def reverb_ir(d=2.2, decay=0.6, lp=5000):
    t = tt(d)
    ir = onepole(noise(len(t)), lp) * np.exp(-t / decay)
    return ir / np.sqrt((ir ** 2).sum())


def convolve(x, ir):
    n = len(x) + len(ir) - 1
    m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:n]


# ── the cue sheet: (beat, sound, gain, pan) ──
def cues():
    c = []
    add = lambda beat, s, g, pan=0.0: c.append((beat, s, g, pan))
    PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0, 2349.3]
    # 01 sort
    add(0, boom(1.4, 110, 34), 0.95)
    add(0, whoosh(0.9, 400, 9000, 0.15, up=False), 0.35)
    for k in range(36):  # the shuffle into the grid
        add(2 + k * 0.0032 / B * 1.0 + k * 0.009 / B, tick(1800 + 30 * k, 0.03, 0.004, 0.6), 0.16, (k % 5 - 2) * 0.25)
    add(2.9, sweep(0.42, 900, 3600), 0.12)
    add(3.3, riser(b(4) - b(3.3), 300, 9000), 0.32)
    # 02 parse
    add(4, tick(2600, 0.06, 0.01, 0.8), 0.5)
    add(4, punch(200, 70, 0.25), 0.45)
    for i in range(6):
        add(5 + i * 0.055 / B, tick(PENTA[i + 2], 0.06, 0.012, 0.2), 0.2, (i - 2.5) * 0.25)
    for i in range(15):
        add(5.2 + i * 0.32 / 15 / B, tick(3200, 0.03, 0.003, 0.9), 0.1)
    add(5.45, whoosh(0.5, 600, 5000, 0.6), 0.22)
    add(7, whoosh(0.5, 4000, 300, 0.2, up=False), 0.3)
    add(7, tock(1400), 0.35)
    add(7.32, riser(b(8.05) - b(7.32), 400, 10000), 0.4)
    # 03 map
    add(8, punch(140, 50, 0.4), 0.55)
    for j in range(12):
        for r in (0.0, 0.18):
            add(8 - 0.12 / B + j * 0.05 / B + (6 + r * 40) * 0.018 / B, tick(PENTA[j], 0.08, 0.02, 0.15), 0.14, (j - 5.5) * 0.12)
    add(10, sweep(0.6, 300, 600), 0.12)
    for k in range(11):
        add(11 + k * 0.03 / B, tock(800 + 40 * k), 0.13, 0.3)
    for k in range(4):
        add(12 + k * 0.07 / B, punch(260, 90, 0.2), 0.4, (k - 1.5) * 0.3)
    # 04 flag (on the song's fill)
    for i in range(3):
        add(13 + i - 0.18, whoosh(0.32, 500, 7000, 0.85), 0.35, (i - 1) * 0.6)
        add(13 + i, punch(180, 55, 0.35), 0.6, (i - 1) * 0.5)
        for k in range(10):
            add(13 + i + (0.02 + k * 0.03) / B, tick(2400 - 60 * k, 0.025, 0.003, 0.7), 0.1, (i - 1) * 0.5)
    add(15.5, riser(b(16) - b(15.5), 600, 9000), 0.28)
    # 05 report
    add(16, boom(1.0, 90, 40, 0.3), 0.55)
    add(16, chime([523.25, 783.99], 1.0, 0.3), 0.14)
    for i in range(11):
        add(16.6 + i * 0.032 / B, tick(PENTA[i % 12] * 2, 0.04, 0.006, 0.3), 0.08, (i - 5) * 0.1)
    for i in range(11):
        add(17.5 + i * 0.045 / B, tick(PENTA[i], 0.07, 0.015, 0.1), 0.15, (i - 5) * 0.12)
    add(19, sweep(0.65, 1800, 5200), 0.07)
    for k in range(6):
        add(20 + k * 0.035 / B, bandpass(noise(int(0.04 * SR)), 1500, 9000) * np.exp(-np.arange(int(0.04 * SR)) / SR / 0.01), 0.25, (k - 2.5) * 0.3)
    add(20.55, riser(b(21) - b(20.55), 500, 12000), 0.4)
    # 06 read
    add(21, boom(0.9, 120, 45, 0.8), 0.6)
    add(21, shutter(), 0.45)
    for k in range(18):
        add(21 + (0.03 + k * 0.025) / B, tick(1500 + 50 * k, 0.025, 0.003, 0.8), 0.08)
    add(22, sweep(0.36, 700, 2800), 0.18)
    add(22.3, tick(1318.5, 0.12, 0.04, 0.0), 0.2)
    add(22.3 + 0.07 / B, tick(1760, 0.14, 0.05, 0.0), 0.2)
    add(22.5, tick(2600, 0.05, 0.01, 0.4), 0.15)
    add(23, shutter(), 0.5)
    for k in range(18):
        add(23 + (0.04 + k * 0.025) / B, tick(1700 + 60 * k, 0.025, 0.003, 0.8), 0.08)
    add(23.15, chime([1046.5, 1568.0], 0.9, 0.25), 0.16)
    add(23.6, whoosh(0.4, 300, 4000, 0.6), 0.22)
    for i, (beat, f, g) in enumerate([(24, 523.25, 1), (25, 659.25, 1), (25.5, 587.33, 0.55), (26, 783.99, 1), (26.5, 1046.5, 1)]):
        add(beat, chime([f, f * 2], 0.8, 0.22), 0.17 * g, (i - 2) * 0.25)
    for i in range(3):
        add(26 + i * 0.08 / B, tick(2200, 0.04, 0.006, 0.4), 0.1)
    # 07 resolve
    add(27.15, riser(b(28) - b(27.15), 200, 12000), 0.45)
    add(CUT, boom(2.0, 120, 30, 1.0), 1.0)
    add(CUT, chime([261.63, 329.63, 392.0, 523.25, 783.99], 2.2, 0.8, 0.5), 0.3)
    add(28.6, sweep(0.7, 1500, 4800), 0.06)
    add(28.6, whoosh(0.6, 800, 7000, 0.5), 0.12)
    for i in range(4):
        add(29.4 + i * 0.09 / B, tick(PENTA[[0, 2, 4, 5][i]] * 2, 0.06, 0.012, 0.1), 0.09)
    return c


def main():
    song, out = sys.argv[1:3]
    n = int(T * SR)
    music = decode(song, SONG_START, T + 0.1)[:n]
    music[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]
    # the cut: a 40 ms fade on beat 28, and the bar before it ringing out through a reverb
    ci = int(b(CUT) * SR)
    fade = int(0.04 * SR)
    pre = music[ci - int(0.35 * SR): ci].copy()
    music[ci: ci + fade] *= np.linspace(1, 0, fade)[:, None]
    music[ci + fade:] = 0
    ir = reverb_ir(2.4, 0.7, 4000)
    for ch in range(2):
        wet = convolve(pre[:, ch], ir)
        s = ci - len(pre)
        e = min(n, s + len(wet))
        tail = wet[: e - s] * np.concatenate([np.zeros(len(pre)), np.ones(e - s - len(pre))])
        music[s:e, ch] += 0.5 * tail

    sfx = np.zeros((n, 2))
    for beat, s, g, pan in cues():
        i = int(round(b(beat) * SR))
        if i >= n:
            continue
        e = min(n, i + len(s))
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sfx[i:e, 0] += s[: e - i] * g * l * 1.41
        sfx[i:e, 1] += s[: e - i] * g * r * 1.41
    # a short room on the effects
    room = reverb_ir(1.2, 0.25, 6000)
    for ch in range(2):
        sfx[:, ch] += 0.18 * convolve(sfx[:, ch], room)[:n]

    mix = music * 0.72 + sfx * 0.62
    mix[-int(0.08 * SR):] *= np.linspace(1, 0, int(0.08 * SR))[:, None]
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix *= 0.97 / np.abs(mix).max() * 0.58  # about -14 LUFS, the usual target for video
    pcm = (mix * 32767).astype("<i2")
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{out}: {n / SR:.2f} s, {len(cues())} sounds")


if __name__ == "__main__":
    main()
