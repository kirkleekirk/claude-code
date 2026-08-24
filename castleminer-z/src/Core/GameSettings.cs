namespace CastleMinerZ.Core
{
    /// <summary>
    /// Player-facing options plus the two knobs that decide whether the game holds frame
    /// rate. Defaults differ per platform: the Xbox build ships the view distance the
    /// console can actually sustain, the desktop build starts higher.
    /// </summary>
    public sealed class GameSettings
    {
        public int ViewRadius;
        public float LookSensitivity = 3.4f;
        public bool InvertY;
        public float MasterVolume = 0.8f;
        public bool ShowDebugOverlay;

        /// <summary>Drop carried items where you died. Off makes the danger zones far more forgiving.</summary>
        public bool DropItemsOnDeath = true;

        /// <summary>Vibrate the pad on damage and on weapon fire.</summary>
        public bool Rumble = true;

        public GameSettings()
        {
#if XBOX360
            ViewRadius = Constants.ViewRadiusColumns;
#else
            ViewRadius = Constants.ViewRadiusColumns + 4;
#endif
        }
    }

    /// <summary>Run statistics, shown on the pause and death screens and written into saves.</summary>
    public sealed class GameStats
    {
        public int BlocksMined;
        public int BlocksPlaced;
        public int Kills;
        public int DragonsSlain;
        public int Deaths;
        public long Score;
        public float TimePlayed;
        public float FurthestDistance;

        public int DaysSurvived
        {
            get { return (int)(TimePlayed / Constants.DayLengthSeconds); }
        }

        public void Reset()
        {
            BlocksMined = 0;
            BlocksPlaced = 0;
            Kills = 0;
            DragonsSlain = 0;
            Deaths = 0;
            Score = 0;
            TimePlayed = 0.0f;
            FurthestDistance = 0.0f;
        }
    }
}
