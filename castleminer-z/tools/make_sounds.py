#!/usr/bin/env python3
"""Synthesises the game's sound effects as 16-bit PCM WAV files.

Everything is generated rather than sampled, for the same reason the textures are:
the whole content set should be reproducible from the repository with no binary
assets of unclear origin and no external dependencies.

22.05 kHz mono is deliberate. The XNA content pipeline compresses these into the
title's package, and on a console where the whole game has to fit in an Xbox Live
Indie Games size budget, halving the sample rate on short effects is free quality.

Run:  python3 tools/make_sounds.py
Out:  content/Audio/*.wav
"""

import math
import os
import struct
import wave

RATE = 22050


class Rng(object):
    """Deterministic noise source, so the audio is byte-identical on every run."""

    def __init__(self, seed):
        self.state = seed & 0xFFFFFFFF or 0x9E3779B9

    def next(self):
        s = self.state
        s ^= (s << 13) & 0xFFFFFFFF
        s ^= s >> 17
        s ^= (s << 5) & 0xFFFFFFFF
        self.state = s
        return s

    def bipolar(self):
        return (self.next() / 4294967295.0) * 2.0 - 1.0


def silence(duration):
    return [0.0] * int(RATE * duration)


def noise(duration, rng):
    return [rng.bipolar() for _ in range(int(RATE * duration))]


def tone(duration, start_hz, end_hz=None, shape='sine'):
    n = int(RATE * duration)
    if end_hz is None:
        end_hz = start_hz

    out = []
    phase = 0.0
    for i in range(n):
        t = i / float(n) if n else 0.0
        hz = start_hz + (end_hz - start_hz) * t
        phase += 2.0 * math.pi * hz / RATE
        if shape == 'sine':
            out.append(math.sin(phase))
        elif shape == 'square':
            out.append(1.0 if math.sin(phase) >= 0.0 else -1.0)
        else:  # saw
            out.append(((phase / (2.0 * math.pi)) % 1.0) * 2.0 - 1.0)
    return out


def envelope(samples, attack=0.005, decay=None, curve=2.0):
    """Fast attack then an exponential-ish decay over the remainder."""
    n = len(samples)
    if n == 0:
        return samples
    attack_samples = max(1, int(RATE * attack))
    out = []
    for i, s in enumerate(samples):
        if i < attack_samples:
            gain = i / float(attack_samples)
        else:
            t = (i - attack_samples) / float(max(1, n - attack_samples))
            gain = (1.0 - t) ** curve
        out.append(s * gain)
    return out


def lowpass(samples, cutoff_hz):
    """One-pole low pass. Enough to turn white noise into something with weight."""
    if not samples:
        return samples
    rc = 1.0 / (2.0 * math.pi * cutoff_hz)
    dt = 1.0 / RATE
    alpha = dt / (rc + dt)
    out = []
    y = 0.0
    for s in samples:
        y += alpha * (s - y)
        out.append(y)
    return out


def highpass(samples, cutoff_hz):
    if not samples:
        return samples
    rc = 1.0 / (2.0 * math.pi * cutoff_hz)
    dt = 1.0 / RATE
    alpha = rc / (rc + dt)
    out = []
    prev_in = samples[0]
    y = 0.0
    for s in samples:
        y = alpha * (y + s - prev_in)
        prev_in = s
        out.append(y)
    return out


def mix(*tracks):
    length = max(len(t) for t in tracks)
    out = [0.0] * length
    for track in tracks:
        for i, s in enumerate(track):
            out[i] += s
    return out


def gain(samples, amount):
    return [s * amount for s in samples]


def normalise(samples, peak=0.86):
    if not samples:
        return samples
    loudest = max(abs(s) for s in samples)
    if loudest < 1e-6:
        return samples
    scale = peak / loudest
    return [s * scale for s in samples]


def write_wav(path, samples):
    samples = normalise(samples)
    frames = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s)) * 32767)
        frames += struct.pack('<h', v)

    with wave.open(path, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(bytes(frames))


# --------------------------------------------------------------------------
# The individual effects
# --------------------------------------------------------------------------

def make_break(rng):
    body = lowpass(noise(0.22, rng), 2600)
    crack = highpass(noise(0.06, rng), 3000)
    return mix(envelope(body, 0.002, curve=2.5), gain(envelope(crack, 0.001, curve=4.0), 0.5))


def make_place(rng):
    thud = lowpass(noise(0.10, rng), 900)
    click = tone(0.05, 320, 180)
    return mix(envelope(thud, 0.001, curve=3.0), gain(envelope(click, 0.001, curve=4.0), 0.4))


def make_hit(rng):
    thud = lowpass(noise(0.14, rng), 1400)
    body = tone(0.10, 200, 90)
    return mix(envelope(thud, 0.001, curve=3.0), gain(envelope(body, 0.001, curve=3.0), 0.7))


def make_hurt(rng):
    grunt = tone(0.28, 240, 120, 'saw')
    breath = lowpass(noise(0.28, rng), 1800)
    return mix(gain(envelope(grunt, 0.01, curve=2.0), 0.8), gain(envelope(breath, 0.01, curve=2.0), 0.35))


def make_gunshot(rng):
    crack = highpass(noise(0.12, rng), 1800)
    body = lowpass(noise(0.20, rng), 700)
    return mix(envelope(crack, 0.0005, curve=6.0), gain(envelope(body, 0.001, curve=3.0), 0.8))


def make_shotgun(rng):
    blast = lowpass(noise(0.40, rng), 1200)
    crack = highpass(noise(0.16, rng), 1400)
    return mix(envelope(blast, 0.001, curve=2.2), gain(envelope(crack, 0.0005, curve=5.0), 0.7))


def make_laser(rng):
    sweep = tone(0.26, 1800, 240, 'square')
    fizz = highpass(noise(0.26, rng), 2600)
    return mix(gain(envelope(sweep, 0.002, curve=2.5), 0.75), gain(envelope(fizz, 0.002, curve=3.0), 0.25))


def make_explosion(rng):
    boom = lowpass(noise(0.85, rng), 380)
    debris = lowpass(noise(0.85, rng), 2400)
    sub = tone(0.5, 90, 35)
    return mix(envelope(boom, 0.004, curve=1.6),
               gain(envelope(debris, 0.004, curve=2.6), 0.35),
               gain(envelope(sub, 0.004, curve=2.0), 0.5))


def make_pickup(rng):
    first = envelope(tone(0.06, 660, 660), 0.002, curve=3.0)
    second = envelope(tone(0.09, 990, 990), 0.002, curve=3.0)
    return first + gain(second, 0.8)


def make_zombie(rng):
    growl = tone(0.55, 90, 62, 'saw')
    rasp = lowpass(noise(0.55, rng), 900)

    # Amplitude modulation is what turns a flat drone into something that sounds
    # like it is being produced by a throat.
    out = mix(gain(growl, 0.7), gain(rasp, 0.5))
    for i in range(len(out)):
        t = i / float(RATE)
        out[i] *= 0.6 + 0.4 * math.sin(2.0 * math.pi * 7.5 * t)
    return envelope(out, 0.03, curve=1.5)


def make_skeleton(rng):
    """Bone rattle: a handful of dry clicks in quick succession."""
    out = []
    for k in range(5):
        click = highpass(noise(0.035, rng), 2200)
        out += gain(envelope(click, 0.0005, curve=5.0), 0.8 - k * 0.12)
        out += silence(0.018)
    return out


def make_dragon(rng):
    roar = mix(
        tone(1.20, 70, 48, 'saw'),
        gain(tone(1.20, 105, 74, 'saw'), 0.6),
        gain(tone(1.20, 141, 96, 'square'), 0.25))
    breath = lowpass(noise(1.20, rng), 1500)

    out = mix(gain(roar, 0.8), gain(breath, 0.45))
    for i in range(len(out)):
        t = i / float(RATE)
        out[i] *= 0.7 + 0.3 * math.sin(2.0 * math.pi * 4.0 * t)
    return envelope(out, 0.06, curve=1.3)


def make_menu_move(rng):
    return envelope(tone(0.045, 880), 0.002, curve=3.0)


def make_menu_select(rng):
    first = envelope(tone(0.05, 740), 0.002, curve=3.0)
    second = envelope(tone(0.10, 1180), 0.002, curve=3.0)
    return first + gain(second, 0.9)


EFFECTS = [
    ('break', make_break),
    ('place', make_place),
    ('hit', make_hit),
    ('hurt', make_hurt),
    ('gunshot', make_gunshot),
    ('shotgun', make_shotgun),
    ('laser', make_laser),
    ('explosion', make_explosion),
    ('pickup', make_pickup),
    ('zombie', make_zombie),
    ('skeleton', make_skeleton),
    ('dragon', make_dragon),
    ('menu_move', make_menu_move),
    ('menu_select', make_menu_select),
]


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, 'content', 'Audio')
    os.makedirs(out, exist_ok=True)

    for index, (name, builder) in enumerate(EFFECTS):
        rng = Rng(0x5EED + index * 7919)
        samples = builder(rng)
        path = os.path.join(out, name + '.wav')
        write_wav(path, samples)
        print('%-14s %5.2fs' % (name + '.wav', len(samples) / float(RATE)))


if __name__ == '__main__':
    main()
