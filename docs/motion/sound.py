"""The loop's audio: the song's 16-bar window plus the UI sounds, each on the song's measured transient.

    python sound.py song.mp3 grid.json cues.json out.wav

grid.json comes from beats.py (--json): the window's start, the beat length, and the measured onset peak of
each beat. cues.json comes from render.mjs: every UI sound's time in the video, in seconds. A cue on a beat
(or within 40 ms of one) is moved to that beat's measured peak; one between beats keeps its offset from the
previous beat's peak. The sounds are synthesized here (no samples to download): click, key, keycap, toggle,
shutter. The window's last 30 ms are crossfaded with the 30 ms just before its start, so the loop has no click.
"""
import json
import subprocess
import sys
import wave

import numpy as np

SR = 48000


def decode(path, start, dur):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.4f}", "-t", f"{dur:.4f}", "-i", path,
                          "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


rng = np.random.default_rng(7)


def noise(n):
    return rng.standard_normal(n)


def bandpass(x, lo, hi):
    f = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    f[(fr < lo) | (fr > hi)] = 0
    return np.fft.irfft(f, len(x))


def tone(n, hz, decay):
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * hz * t) * np.exp(-t / decay)


def sound(kind):
    if kind == "click":  # a trackpad click: a short high tick over a soft body
        n = int(0.06 * SR)
        return 0.5 * bandpass(noise(n), 2500, 9000) * env(n, 0.0005, 0.006) + 0.35 * tone(n, 1400, 0.012)
    if kind == "key":  # a laptop key: shorter, a bit lower
        n = int(0.05 * SR)
        return 0.38 * bandpass(noise(n), 1500, 6000) * env(n, 0.0004, 0.005) + 0.2 * tone(n, 900, 0.01)
    if kind == "keycap":  # a shortcut pressed: two keys down at once, heavier
        n = int(0.09 * SR)
        return 0.55 * bandpass(noise(n), 800, 5000) * env(n, 0.0006, 0.012) + 0.35 * tone(n, 520, 0.025)
    if kind == "toggle":  # two quick ticks, the second higher
        n = int(0.12 * SR)
        a = 0.4 * tone(n, 1200, 0.012) + 0.3 * bandpass(noise(n), 3000, 9000) * env(n, 0.0004, 0.004)
        b = np.zeros(n)
        k = int(0.045 * SR)
        b[k:] = (0.45 * tone(n - k, 1800, 0.014) + 0.3 * bandpass(noise(n - k), 3000, 9000) * env(n - k, 0.0004, 0.004))
        return a + b
    if kind == "shutter":  # a camera shutter: two clacks of filtered noise
        n = int(0.16 * SR)
        x = 0.6 * bandpass(noise(n), 1200, 7000) * env(n, 0.0005, 0.01)
        k = int(0.07 * SR)
        x[k:] += 0.45 * bandpass(noise(n - k), 900, 6000) * env(n - k, 0.0005, 0.014)
        return x
    raise ValueError(kind)


def main():
    song, grid_path, cues_path, out = sys.argv[1:5]
    grid = json.load(open(grid_path))
    cues = json.load(open(cues_path))
    T, B = cues["T"], cues["B"]
    start, peaks = grid["start"], grid["peaks"]

    music = decode(song, start - 0.03, T + 0.03)
    xf = int(0.03 * SR)
    body = music[xf:xf + int(round(T * SR))]
    ramp = np.linspace(0, 1, xf)[:, None]
    body[-xf:] = body[-xf:] * (1 - ramp) + music[:xf] * ramp  # the end runs into what precedes the start
    n = len(body)

    sfx = np.zeros(n)
    placed = []
    for c in cues["cues"]:
        b = c["t"] / B
        k = int(np.floor(b + 1e-6))
        frac = b - k
        if frac > 1 - 0.04 / B:  # just before a beat: that beat
            k, frac = k + 1, 0.0
        if frac < 0.04 / B:
            frac = 0.0
        when = (peaks[k % 64] - start) + frac * B  # measured transient of the beat (+ the offset between beats)
        when %= T
        s = sound(c["type"])
        i = int(round(when * SR))
        end = min(n, i + len(s))
        sfx[i:end] += s[:end - i]
        if i + len(s) > n:  # wraps past the loop point
            sfx[:i + len(s) - n] += s[end - i:]
        placed.append((round(when, 3), c["type"]))

    mix = body * 0.82 + sfx[:, None] * 0.5
    peak = np.abs(mix).max()
    if peak > 0.98:
        mix *= 0.98 / peak
    pcm = (mix * 32767).astype("<i2")
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{out}: {n / SR:.3f} s, {len(placed)} sounds")


if __name__ == "__main__":
    main()
