using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Audio;
using CastleMinerZ.Assets;

namespace CastleMinerZ
{
    public enum SoundId
    {
        Break = 0,
        Place,
        Hit,
        Hurt,
        Gunshot,
        Shotgun,
        Laser,
        Explosion,
        Pickup,
        ZombieAttack,
        SkeletonShoot,
        DragonRoar,
        MenuMove,
        MenuSelect,
        Count
    }

    /// <summary>
    /// Fire-and-forget positional audio.
    ///
    /// Sounds are played through <see cref="SoundEffect.Play(float,float,float)"/> with
    /// volume and pan computed by hand rather than through AudioEmitter/AudioListener: the
    /// full 3D path allocates a cue object per call, and this game can easily fire thirty
    /// sounds in a second during a horde fight.
    ///
    /// The effects are synthesised at startup by <see cref="SoundFactory"/> rather than
    /// loaded, so there are no audio assets to build and nothing to keep in step with the
    /// <see cref="SoundId"/> enum. A null slot simply plays nothing.
    /// </summary>
    public sealed class SoundManager
    {
        private const float MaxAudibleDistance = 48.0f;

        private readonly SoundEffect[] _sounds = new SoundEffect[(int)SoundId.Count];

        private Vector3 _listenerPosition;
        private Vector3 _listenerRight = Vector3.Right;

        public float MasterVolume = 0.8f;
        public bool Enabled = true;

        /// <summary>
        /// Synthesises every effect. Takes a fraction of a second, once, at startup.
        ///
        /// A machine with no working audio device throws on the very first SoundEffect
        /// constructed. That is not a reason to refuse to start the game, so the failure is
        /// caught here and the whole subsystem switches itself off -- every Play call then
        /// becomes a no-op and everything else carries on.
        /// </summary>
        public void Initialise()
        {
            try
            {
                SoundEffect[] generated = SoundFactory.CreateAll();
                for (int i = 0; i < _sounds.Length && i < generated.Length; i++) _sounds[i] = generated[i];
            }
            catch (NoAudioHardwareException)
            {
                Enabled = false;
                Available = false;
            }
            catch (InstancePlayLimitException)
            {
                Enabled = false;
                Available = false;
            }
        }

        /// <summary>False when the platform has no usable audio device.</summary>
        public bool Available = true;

        public void SetListener(Vector3 position, Vector3 right)
        {
            _listenerPosition = position;
            _listenerRight = right;
        }

        /// <summary>Plays a sound at a world position, attenuated and panned for the listener.</summary>
        public void Play(SoundId id, Vector3 position)
        {
            if (!Enabled) return;
            SoundEffect sound = _sounds[(int)id];
            if (sound == null) return;

            Vector3 offset = position - _listenerPosition;
            float distance = offset.Length();
            if (distance > MaxAudibleDistance) return;

            float volume = 1.0f - distance / MaxAudibleDistance;
            volume = volume * volume * MasterVolume;
            if (volume <= 0.005f) return;

            float pan = 0.0f;
            if (distance > 0.4f)
            {
                offset /= distance;
                pan = MathHelper.Clamp(Vector3.Dot(offset, _listenerRight), -1.0f, 1.0f);
                // Sounds directly ahead or behind should not hard-pan.
                pan *= MathHelper.Clamp(distance / 6.0f, 0.0f, 1.0f);
            }

            SafePlay(sound, volume, 0.0f, pan);
        }

        /// <summary>Plays at full volume with no positioning. Used for UI and for the player's own weapon.</summary>
        public void Play2D(SoundId id, float volume, float pitch)
        {
            if (!Enabled) return;
            SoundEffect sound = _sounds[(int)id];
            if (sound == null) return;
            SafePlay(sound, volume * MasterVolume, pitch, 0.0f);
        }

        private static void SafePlay(SoundEffect sound, float volume, float pitch, float pan)
        {
            try
            {
                sound.Play(MathHelper.Clamp(volume, 0.0f, 1.0f),
                    MathHelper.Clamp(pitch, -1.0f, 1.0f),
                    MathHelper.Clamp(pan, -1.0f, 1.0f));
            }
            catch (InstancePlayLimitException)
            {
                // The platform ran out of voices this frame. Dropping the sound is the
                // right answer -- it is already inaudible under everything else.
            }
        }
    }
}
