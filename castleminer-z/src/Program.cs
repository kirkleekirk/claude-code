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
                game.Run();
            }
        }
    }
}
