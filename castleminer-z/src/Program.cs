using System;

namespace CastleMinerZ
{
    /// <summary>Entry point. Xbox 360 titles start the same way Windows ones do.</summary>
    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            using (CastleMinerZGame game = new CastleMinerZGame())
            {
                ApplyArguments(game, args);
                game.Run();
            }
        }

        /// <summary>
        /// Command-line options, used by the capture script that verifies the renderer.
        /// A normal launch passes none of these.
        ///
        ///   --seed N          start a world immediately on seed N, skipping the menu
        ///   --screenshot P    write a PNG to P and exit
        ///   --frame N         capture on frame N (default 90)
        ///   --warmup S        simulate S game seconds before drawing, so terrain streams in
        ///   --time T          force time of day, 0 = midnight, 0.5 = noon
        ///   --pitch R         force camera pitch in radians
        ///   --fullbright      ignore baked lighting, to separate geometry faults from lighting ones
        ///   --debug           show the debug overlay
        ///   --dump-assets D   write the generated art to D as PNGs and exit
        /// </summary>
        private static void ApplyArguments(CastleMinerZGame game, string[] args)
        {
            if (args == null) return;

            for (int i = 0; i < args.Length; i++)
            {
                bool hasValue = i + 1 < args.Length;

                switch (args[i])
                {
                    case "--seed":
                        if (hasValue) game.AutoStartSeed = int.Parse(args[++i]);
                        break;

                    case "--screenshot":
                        if (hasValue)
                        {
                            game.ScreenshotPath = args[++i];
                            if (game.ScreenshotFrame < 0) game.ScreenshotFrame = 90;
                        }
                        break;

                    case "--frame":
                        if (hasValue) game.ScreenshotFrame = int.Parse(args[++i]);
                        break;

                    case "--fullbright":
                        World.ChunkWorker.FullBright = true;
                        break;

                    case "--debug":
                        game.Settings.ShowDebugOverlay = true;
                        break;

                    case "--pitch":
                        if (hasValue)
                        {
                            game.CapturePitch = float.Parse(args[++i], System.Globalization.CultureInfo.InvariantCulture);
                            game.HasCapturePitch = true;
                        }
                        break;

                    case "--dump-assets":
                        if (hasValue) game.DumpAssetsPath = args[++i];
                        break;

                    case "--time":
                        if (hasValue) game.CaptureTime = float.Parse(args[++i],
                            System.Globalization.CultureInfo.InvariantCulture);
                        break;

                    case "--warmup":
                        if (hasValue) game.WarmUpSeconds = float.Parse(args[++i],
                            System.Globalization.CultureInfo.InvariantCulture);
                        break;
                }
            }
        }
    }
}
