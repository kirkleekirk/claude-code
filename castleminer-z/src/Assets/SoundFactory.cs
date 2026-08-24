using Microsoft.Xna.Framework.Audio;

namespace CastleMinerZ.Assets
{
    /// <summary>
    /// Synthesises every sound effect at startup.
    ///
    /// Same reasoning as the textures: no audio assets to build, nothing to keep in step
    /// with the <see cref="SoundId"/> enum, and no binaries in the repository. Total output
    /// is about five seconds of 22 kHz mono, which is a few hundred thousand float
    /// operations -- a fraction of a second even on an in-order console CPU, and it happens
    /// once.
    ///
    /// 22.05 kHz is deliberate. These are short, noisy effects where the top octave carries
    /// no information, and halving the rate halves both the synthesis cost and the memory
    /// they occupy.
    /// </summary>
    public static class SoundFactory
    {
        public const int SampleRate = 22050;

        /// <summary>Builds one <see cref="SoundEffect"/> per <see cref="SoundId"/>, in enum order.</summary>
        public static SoundEffect[] CreateAll()
        {
            SoundEffect[] sounds = new SoundEffect[(int)SoundId.Count];

            sounds[(int)SoundId.Break] = Build(MakeBreak(new Rng(0x5EED)));
            sounds[(int)SoundId.Place] = Build(MakePlace(new Rng(0x5EED + 7919)));
            sounds[(int)SoundId.Hit] = Build(MakeHit(new Rng(0x5EED + 15838)));
            sounds[(int)SoundId.Hurt] = Build(MakeHurt(new Rng(0x5EED + 23757)));
            sounds[(int)SoundId.Gunshot] = Build(MakeGunshot(new Rng(0x5EED + 31676)));
            sounds[(int)SoundId.Shotgun] = Build(MakeShotgun(new Rng(0x5EED + 39595)));
            sounds[(int)SoundId.Laser] = Build(MakeLaser(new Rng(0x5EED + 47514)));
            sounds[(int)SoundId.Explosion] = Build(MakeExplosion(new Rng(0x5EED + 55433)));
            sounds[(int)SoundId.Pickup] = Build(MakePickup());
            sounds[(int)SoundId.ZombieAttack] = Build(MakeZombie(new Rng(0x5EED + 71271)));
            sounds[(int)SoundId.SkeletonShoot] = Build(MakeSkeleton(new Rng(0x5EED + 79190)));
            sounds[(int)SoundId.DragonRoar] = Build(MakeDragon(new Rng(0x5EED + 87109)));
            sounds[(int)SoundId.MenuMove] = Build(Envelope(Tone(0.045f, 880.0f, 880.0f, Wave.Sine), 0.002f, 3.0f));
            sounds[(int)SoundId.MenuSelect] = Build(MakeMenuSelect());

            return sounds;
        }

        private static SoundEffect Build(float[] samples)
        {
            Normalise(samples, 0.86f);

            byte[] pcm = new byte[samples.Length * 2];
            for (int i = 0; i < samples.Length; i++)
            {
                float v = samples[i];
                if (v > 1.0f) v = 1.0f;
                if (v < -1.0f) v = -1.0f;

                short s = (short)(v * 32767.0f);
                pcm[i * 2] = (byte)(s & 0xFF);
                pcm[i * 2 + 1] = (byte)((s >> 8) & 0xFF);
            }

            return new SoundEffect(pcm, SampleRate, AudioChannels.Mono);
        }

        // ---- The individual effects -------------------------------------------

        private static float[] MakeBreak(Rng rng)
        {
            float[] body = Envelope(LowPass(Noise(0.22f, ref rng), 2600.0f), 0.002f, 2.5f);
            float[] crack = Gain(Envelope(HighPass(Noise(0.06f, ref rng), 3000.0f), 0.001f, 4.0f), 0.5f);
            return Mix(body, crack);
        }

        private static float[] MakePlace(Rng rng)
        {
            float[] thud = Envelope(LowPass(Noise(0.10f, ref rng), 900.0f), 0.001f, 3.0f);
            float[] click = Gain(Envelope(Tone(0.05f, 320.0f, 180.0f, Wave.Sine), 0.001f, 4.0f), 0.4f);
            return Mix(thud, click);
        }

        private static float[] MakeHit(Rng rng)
        {
            float[] thud = Envelope(LowPass(Noise(0.14f, ref rng), 1400.0f), 0.001f, 3.0f);
            float[] body = Gain(Envelope(Tone(0.10f, 200.0f, 90.0f, Wave.Sine), 0.001f, 3.0f), 0.7f);
            return Mix(thud, body);
        }

        private static float[] MakeHurt(Rng rng)
        {
            float[] grunt = Gain(Envelope(Tone(0.28f, 240.0f, 120.0f, Wave.Saw), 0.01f, 2.0f), 0.8f);
            float[] breath = Gain(Envelope(LowPass(Noise(0.28f, ref rng), 1800.0f), 0.01f, 2.0f), 0.35f);
            return Mix(grunt, breath);
        }

        private static float[] MakeGunshot(Rng rng)
        {
            float[] crack = Envelope(HighPass(Noise(0.12f, ref rng), 1800.0f), 0.0005f, 6.0f);
            float[] body = Gain(Envelope(LowPass(Noise(0.20f, ref rng), 700.0f), 0.001f, 3.0f), 0.8f);
            return Mix(crack, body);
        }

        private static float[] MakeShotgun(Rng rng)
        {
            float[] blast = Envelope(LowPass(Noise(0.40f, ref rng), 1200.0f), 0.001f, 2.2f);
            float[] crack = Gain(Envelope(HighPass(Noise(0.16f, ref rng), 1400.0f), 0.0005f, 5.0f), 0.7f);
            return Mix(blast, crack);
        }

        private static float[] MakeLaser(Rng rng)
        {
            float[] sweep = Gain(Envelope(Tone(0.26f, 1800.0f, 240.0f, Wave.Square), 0.002f, 2.5f), 0.75f);
            float[] fizz = Gain(Envelope(HighPass(Noise(0.26f, ref rng), 2600.0f), 0.002f, 3.0f), 0.25f);
            return Mix(sweep, fizz);
        }

        private static float[] MakeExplosion(Rng rng)
        {
            float[] boom = Envelope(LowPass(Noise(0.85f, ref rng), 380.0f), 0.004f, 1.6f);
            float[] debris = Gain(Envelope(LowPass(Noise(0.85f, ref rng), 2400.0f), 0.004f, 2.6f), 0.35f);
            float[] sub = Gain(Envelope(Tone(0.50f, 90.0f, 35.0f, Wave.Sine), 0.004f, 2.0f), 0.5f);
            return Mix(boom, debris, sub);
        }

        private static float[] MakePickup()
        {
            float[] first = Envelope(Tone(0.06f, 660.0f, 660.0f, Wave.Sine), 0.002f, 3.0f);
            float[] second = Gain(Envelope(Tone(0.09f, 990.0f, 990.0f, Wave.Sine), 0.002f, 3.0f), 0.8f);
            return Concat(first, second);
        }

        private static float[] MakeMenuSelect()
        {
            float[] first = Envelope(Tone(0.05f, 740.0f, 740.0f, Wave.Sine), 0.002f, 3.0f);
            float[] second = Gain(Envelope(Tone(0.10f, 1180.0f, 1180.0f, Wave.Sine), 0.002f, 3.0f), 0.9f);
            return Concat(first, second);
        }

        private static float[] MakeZombie(Rng rng)
        {
            float[] growl = Gain(Tone(0.55f, 90.0f, 62.0f, Wave.Saw), 0.7f);
            float[] rasp = Gain(LowPass(Noise(0.55f, ref rng), 900.0f), 0.5f);
            float[] mixed = Mix(growl, rasp);

            // Amplitude modulation is what turns a flat drone into something that sounds
            // like it is coming out of a throat.
            Tremolo(mixed, 7.5f, 0.4f);
            return Envelope(mixed, 0.03f, 1.5f);
        }

        private static float[] MakeSkeleton(Rng rng)
        {
            // Bone rattle: a handful of dry clicks in quick succession.
            float[] result = new float[0];
            for (int k = 0; k < 5; k++)
            {
                float[] click = Gain(Envelope(HighPass(Noise(0.035f, ref rng), 2200.0f), 0.0005f, 5.0f), 0.8f - k * 0.12f);
                result = Concat(result, click);
                result = Concat(result, new float[(int)(SampleRate * 0.018f)]);
            }
            return result;
        }

        private static float[] MakeDragon(Rng rng)
        {
            float[] roar = Mix(
                Tone(1.20f, 70.0f, 48.0f, Wave.Saw),
                Gain(Tone(1.20f, 105.0f, 74.0f, Wave.Saw), 0.6f),
                Gain(Tone(1.20f, 141.0f, 96.0f, Wave.Square), 0.25f));

            float[] breath = Gain(LowPass(Noise(1.20f, ref rng), 1500.0f), 0.45f);
            float[] mixed = Mix(Gain(roar, 0.8f), breath);
            Tremolo(mixed, 4.0f, 0.3f);
            return Envelope(mixed, 0.06f, 1.3f);
        }

        // ---- Synthesis primitives ---------------------------------------------

        private enum Wave
        {
            Sine,
            Square,
            Saw
        }

        private struct Rng
        {
            private uint _state;

            public Rng(uint seed)
            {
                _state = seed == 0 ? 0x9E3779B9u : seed;
            }

            public float Bipolar()
            {
                _state ^= _state << 13;
                _state ^= _state >> 17;
                _state ^= _state << 5;
                return (_state / 4294967295.0f) * 2.0f - 1.0f;
            }
        }

        private static float[] Noise(float seconds, ref Rng rng)
        {
            float[] samples = new float[(int)(SampleRate * seconds)];
            for (int i = 0; i < samples.Length; i++) samples[i] = rng.Bipolar();
            return samples;
        }

        private static float[] Tone(float seconds, float startHz, float endHz, Wave shape)
        {
            int count = (int)(SampleRate * seconds);
            float[] samples = new float[count];
            double phase = 0.0;

            for (int i = 0; i < count; i++)
            {
                float t = count > 0 ? i / (float)count : 0.0f;
                float hz = startHz + (endHz - startHz) * t;
                phase += 2.0 * System.Math.PI * hz / SampleRate;

                switch (shape)
                {
                    case Wave.Square:
                        samples[i] = System.Math.Sin(phase) >= 0.0 ? 1.0f : -1.0f;
                        break;
                    case Wave.Saw:
                        samples[i] = (float)(((phase / (2.0 * System.Math.PI)) % 1.0) * 2.0 - 1.0);
                        break;
                    default:
                        samples[i] = (float)System.Math.Sin(phase);
                        break;
                }
            }
            return samples;
        }

        /// <summary>Fast attack, then a curved decay across the remainder.</summary>
        private static float[] Envelope(float[] samples, float attackSeconds, float curve)
        {
            int count = samples.Length;
            if (count == 0) return samples;

            int attack = (int)(SampleRate * attackSeconds);
            if (attack < 1) attack = 1;

            for (int i = 0; i < count; i++)
            {
                float gain;
                if (i < attack)
                {
                    gain = i / (float)attack;
                }
                else
                {
                    float t = (i - attack) / (float)(count - attack > 0 ? count - attack : 1);
                    gain = (float)System.Math.Pow(1.0f - t, curve);
                }
                samples[i] *= gain;
            }
            return samples;
        }

        /// <summary>One-pole low pass. Enough to give white noise some weight.</summary>
        private static float[] LowPass(float[] samples, float cutoffHz)
        {
            if (samples.Length == 0) return samples;

            float rc = 1.0f / (2.0f * (float)System.Math.PI * cutoffHz);
            float dt = 1.0f / SampleRate;
            float alpha = dt / (rc + dt);
            float y = 0.0f;

            for (int i = 0; i < samples.Length; i++)
            {
                y += alpha * (samples[i] - y);
                samples[i] = y;
            }
            return samples;
        }

        private static float[] HighPass(float[] samples, float cutoffHz)
        {
            if (samples.Length == 0) return samples;

            float rc = 1.0f / (2.0f * (float)System.Math.PI * cutoffHz);
            float dt = 1.0f / SampleRate;
            float alpha = rc / (rc + dt);

            float previousIn = samples[0];
            float y = 0.0f;

            for (int i = 0; i < samples.Length; i++)
            {
                float input = samples[i];
                y = alpha * (y + input - previousIn);
                previousIn = input;
                samples[i] = y;
            }
            return samples;
        }

        private static void Tremolo(float[] samples, float hz, float depth)
        {
            for (int i = 0; i < samples.Length; i++)
            {
                float t = i / (float)SampleRate;
                samples[i] *= (1.0f - depth) + depth * (float)System.Math.Sin(2.0 * System.Math.PI * hz * t);
            }
        }

        private static float[] Gain(float[] samples, float amount)
        {
            for (int i = 0; i < samples.Length; i++) samples[i] *= amount;
            return samples;
        }

        private static float[] Mix(params float[][] tracks)
        {
            int longest = 0;
            for (int i = 0; i < tracks.Length; i++)
            {
                if (tracks[i].Length > longest) longest = tracks[i].Length;
            }

            float[] result = new float[longest];
            for (int i = 0; i < tracks.Length; i++)
            {
                float[] track = tracks[i];
                for (int s = 0; s < track.Length; s++) result[s] += track[s];
            }
            return result;
        }

        private static float[] Concat(float[] a, float[] b)
        {
            float[] result = new float[a.Length + b.Length];
            System.Array.Copy(a, 0, result, 0, a.Length);
            System.Array.Copy(b, 0, result, a.Length, b.Length);
            return result;
        }

        private static void Normalise(float[] samples, float peak)
        {
            float loudest = 0.0f;
            for (int i = 0; i < samples.Length; i++)
            {
                float magnitude = samples[i] < 0.0f ? -samples[i] : samples[i];
                if (magnitude > loudest) loudest = magnitude;
            }

            if (loudest < 1e-6f) return;

            float scale = peak / loudest;
            for (int i = 0; i < samples.Length; i++) samples[i] *= scale;
        }
    }
}
