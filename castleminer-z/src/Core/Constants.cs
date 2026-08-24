namespace CastleMinerZ
{
    /// <summary>
    /// Tuning values that the whole game agrees on.
    ///
    /// Most of these are sized against the Xbox 360's budget rather than what looks
    /// nicest on a PC: 512 MB of memory shared with the GPU, and a garbage collector
    /// that stops the world every ~1 MB of allocation. Chunk counts and view distance
    /// are the two knobs that decide whether we hold 30 Hz.
    /// </summary>
    public static class Constants
    {
        // ---- Voxel grid -------------------------------------------------------

        /// <summary>Edge length of a chunk section, in blocks. Must stay a power of two.</summary>
        public const int ChunkSize = 16;
        public const int ChunkMask = ChunkSize - 1;
        public const int ChunkShift = 4;
        public const int BlocksPerSection = ChunkSize * ChunkSize * ChunkSize;

        /// <summary>Vertical sections stacked in one column.</summary>
        public const int SectionsPerColumn = 8;

        /// <summary>Total world height in blocks (128).</summary>
        public const int WorldHeight = ChunkSize * SectionsPerColumn;
        public const int MaxBlockY = WorldHeight - 1;

        /// <summary>Y level that terrain generation treats as sea level.</summary>
        public const int SeaLevel = 48;

        // ---- Streaming --------------------------------------------------------

        /// <summary>
        /// Column radius kept resident around the viewer. 6 -> 13x13 columns -> 1352
        /// sections -> ~11 MB of voxel data, which leaves room for meshes and textures.
        /// The Windows build overrides this upward in GameSettings.
        /// </summary>
        public const int ViewRadiusColumns = 6;

        // ---- Lighting ---------------------------------------------------------

        public const int MaxLight = 15;

        // ---- Player -----------------------------------------------------------

        public const float PlayerWidth = 0.6f;
        public const float PlayerHeight = 1.8f;
        public const float PlayerEyeHeight = 1.62f;
        public const float PlayerCrouchHeight = 1.35f;
        public const float PlayerCrouchEyeHeight = 1.2f;

        public const float Gravity = 26.0f;
        public const float TerminalVelocity = 55.0f;
        public const float JumpVelocity = 8.6f;

        public const float WalkSpeed = 4.3f;
        public const float SprintSpeed = 6.4f;
        public const float CrouchSpeed = 1.9f;
        public const float SwimSpeed = 3.0f;

        /// <summary>How far the player can reach to mine or place.</summary>
        public const float ReachDistance = 5.0f;

        public const int PlayerMaxHealth = 100;

        // ---- Simulation -------------------------------------------------------

        /// <summary>Fixed simulation step. Everything gameplay-facing runs on this.</summary>
        public const float FixedTimeStep = 1.0f / 60.0f;

        /// <summary>Never simulate more than this many fixed steps in one frame.</summary>
        public const int MaxCatchUpSteps = 5;

        /// <summary>Real seconds in one full in-game day.</summary>
        public const float DayLengthSeconds = 20.0f * 60.0f;

        // ---- Progression ------------------------------------------------------

        /// <summary>
        /// The core CastleMiner Z idea: danger and reward both scale with how far you
        /// have walked from spawn. These are the block distances where the world
        /// changes character.
        /// </summary>
        public const float DangerZoneDistance = 1000.0f;
        public const float NightmareZoneDistance = 3000.0f;
        public const float HellZoneDistance = 6000.0f;
        public const float DragonZoneDistance = 9000.0f;
    }
}
