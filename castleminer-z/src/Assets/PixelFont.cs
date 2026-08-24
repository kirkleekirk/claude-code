using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace CastleMinerZ.Assets
{
    /// <summary>
    /// The game's only font: a 5x7 pixel face defined in source and rasterised into a
    /// texture at startup.
    ///
    /// This replaces SpriteFont deliberately. XNA's font pipeline bakes glyphs from a
    /// TrueType face installed on the *build machine*, so the content build fails on any
    /// machine that does not have that exact font, and it drags a redistribution question
    /// along with it. Defining the glyphs here removes the build dependency entirely,
    /// costs about half a kilobyte, and suits a game made of cubes rather better than a
    /// smooth typeface would.
    ///
    /// Text is only ever drawn at integer scales, so glyph edges land on pixel boundaries
    /// and stay crisp at any resolution.
    /// </summary>
    public sealed class PixelFont
    {
        public const int GlyphWidth = 5;
        public const int GlyphHeight = 7;

        /// <summary>Atlas cell: one pixel of padding so point sampling cannot bleed neighbours in.</summary>
        private const int CellWidth = GlyphWidth + 1;
        private const int CellHeight = GlyphHeight + 1;

        private const int FirstChar = 32;
        private const int LastChar = 126;
        private const int CharCount = LastChar - FirstChar + 1;
        private const int Columns = 16;

        /// <summary>Horizontal advance per character, unscaled.</summary>
        public const int Advance = GlyphWidth + 1;

        /// <summary>Line-to-line distance, unscaled.</summary>
        public const int LineHeight = GlyphHeight + 2;

        private Texture2D _texture;

        public Texture2D Texture
        {
            get { return _texture; }
        }

        /// <summary>Rasterises the glyph table into a texture. Call once, after the device exists.</summary>
        public void Build(GraphicsDevice device)
        {
            if (_texture != null) return;

            int rows = (CharCount + Columns - 1) / Columns;
            int width = Columns * CellWidth;
            int height = rows * CellHeight;

            // Empty texels must be fully zero, not white-with-zero-alpha. The UI draws with
            // premultiplied alpha blending, where the source colour is *added* to the
            // destination -- so a transparent white texel paints solid white, and every
            // glyph comes out as a filled box.
            Color[] pixels = new Color[width * height];
            Color clear = new Color((byte)0, (byte)0, (byte)0, (byte)0);
            for (int i = 0; i < pixels.Length; i++) pixels[i] = clear;

            for (int index = 0; index < CharCount; index++)
            {
                int originX = (index % Columns) * CellWidth;
                int originY = (index / Columns) * CellHeight;
                string[] glyph = Glyphs[index];

                for (int row = 0; row < GlyphHeight; row++)
                {
                    string line = glyph[row];
                    for (int column = 0; column < GlyphWidth; column++)
                    {
                        if (line[column] != '#') continue;
                        pixels[(originY + row) * width + originX + column] = Color.White;
                    }
                }
            }

            _texture = new Texture2D(device, width, height);
            _texture.SetData(pixels);
        }

        /// <summary>Pixel size of a string at the given integer scale. Handles embedded newlines.</summary>
        public Vector2 Measure(string text, int scale)
        {
            if (text == null || text.Length == 0) return Vector2.Zero;

            int longest = 0;
            int current = 0;
            int lines = 1;

            for (int i = 0; i < text.Length; i++)
            {
                if (text[i] == '\n')
                {
                    if (current > longest) longest = current;
                    current = 0;
                    lines++;
                    continue;
                }
                current++;
            }
            if (current > longest) longest = current;

            return new Vector2(longest * Advance * scale, lines * LineHeight * scale);
        }

        public void Draw(SpriteBatch batch, string text, Vector2 position, Color colour, int scale)
        {
            if (_texture == null || text == null || text.Length == 0) return;

            int startX = (int)position.X;
            int x = startX;
            int y = (int)position.Y;

            Rectangle source = new Rectangle(0, 0, GlyphWidth, GlyphHeight);
            Rectangle destination = new Rectangle(0, 0, GlyphWidth * scale, GlyphHeight * scale);

            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];

                if (c == '\n')
                {
                    x = startX;
                    y += LineHeight * scale;
                    continue;
                }

                if (c < FirstChar || c > LastChar) c = '?';

                // Space draws nothing; skipping the call matters when the HUD pushes several
                // hundred characters every frame.
                if (c != ' ')
                {
                    int index = c - FirstChar;
                    source.X = (index % Columns) * CellWidth;
                    source.Y = (index / Columns) * CellHeight;
                    destination.X = x;
                    destination.Y = y;
                    batch.Draw(_texture, destination, source, colour);
                }

                x += Advance * scale;
            }
        }

        public void Dispose()
        {
            if (_texture != null)
            {
                _texture.Dispose();
                _texture = null;
            }
        }

        private static string[] Glyph(string r0, string r1, string r2, string r3, string r4, string r5, string r6)
        {
            return new string[] { r0, r1, r2, r3, r4, r5, r6 };
        }

        /// <summary>
        /// Glyph bitmaps for ASCII 32..126 in order, seven rows of five columns each, where
        /// '#' is a set pixel. Kept as readable pixel art rather than packed bits, so a
        /// glyph can be corrected by editing the picture of it.
        /// </summary>
        private static readonly string[][] Glyphs =
        {
            Glyph(".....", ".....", ".....", ".....", ".....", ".....", "....."),   // 32 space
            Glyph("..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."),   // 33 '!'
            Glyph(".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."),   // 34 double quote
            Glyph(".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."),   // 35 '#'
            Glyph("..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."),   // 36 '$'
            Glyph("##...", "##..#", "...#.", "..#..", ".#...", "#..##", "...##"),   // 37 '%'
            Glyph(".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"),   // 38 '&'
            Glyph("..#..", "..#..", ".....", ".....", ".....", ".....", "....."),   // 39 single quote
            Glyph("...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."),   // 40 '('
            Glyph(".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."),   // 41 ')'
            Glyph(".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."),   // 42 '*'
            Glyph(".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."),   // 43 '+'
            Glyph(".....", ".....", ".....", ".....", ".##..", "..#..", ".#..."),   // 44 ','
            Glyph(".....", ".....", ".....", "#####", ".....", ".....", "....."),   // 45 '-'
            Glyph(".....", ".....", ".....", ".....", ".....", ".##..", ".##.."),   // 46 '.'
            Glyph("....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."),   // 47 '/'
            Glyph(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),   // 48 '0'
            Glyph("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),   // 49 '1'
            Glyph(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),   // 50 '2'
            Glyph("#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."),   // 51 '3'
            Glyph("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),   // 52 '4'
            Glyph("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),   // 53 '5'
            Glyph("..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."),   // 54 '6'
            Glyph("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),   // 55 '7'
            Glyph(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),   // 56 '8'
            Glyph(".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."),   // 57 '9'
            Glyph(".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."),   // 58 ':'
            Glyph(".....", ".##..", ".##..", ".....", ".##..", "..#..", ".#..."),   // 59 ';'
            Glyph("...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."),   // 60 '<'
            Glyph(".....", ".....", "#####", ".....", "#####", ".....", "....."),   // 61 '='
            Glyph(".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."),   // 62 '>'
            Glyph(".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."),   // 63 '?'
            Glyph(".###.", "#...#", "#.###", "#.#.#", "#.###", "#....", ".###."),   // 64 '@'
            Glyph(".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),   // 65 'A'
            Glyph("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),   // 66 'B'
            Glyph(".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),   // 67 'C'
            Glyph("###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."),   // 68 'D'
            Glyph("#####", "#....", "#....", "####.", "#....", "#....", "#####"),   // 69 'E'
            Glyph("#####", "#....", "#....", "####.", "#....", "#....", "#...."),   // 70 'F'
            Glyph(".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."),   // 71 'G'
            Glyph("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),   // 72 'H'
            Glyph(".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."),   // 73 'I'
            Glyph("....#", "....#", "....#", "....#", "#...#", "#...#", ".###."),   // 74 'J'
            Glyph("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),   // 75 'K'
            Glyph("#....", "#....", "#....", "#....", "#....", "#....", "#####"),   // 76 'L'
            Glyph("#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"),   // 77 'M'
            Glyph("#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"),   // 78 'N'
            Glyph(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),   // 79 'O'
            Glyph("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),   // 80 'P'
            Glyph(".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),   // 81 'Q'
            Glyph("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),   // 82 'R'
            Glyph(".####", "#....", "#....", ".###.", "....#", "....#", "####."),   // 83 'S'
            Glyph("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),   // 84 'T'
            Glyph("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),   // 85 'U'
            Glyph("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),   // 86 'V'
            Glyph("#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"),   // 87 'W'
            Glyph("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),   // 88 'X'
            Glyph("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),   // 89 'Y'
            Glyph("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),   // 90 'Z'
            Glyph(".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."),   // 91 '['
            Glyph("#....", ".#...", ".#...", "..#..", "...#.", "...#.", "....#"),   // 92 backslash
            Glyph(".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."),   // 93 ']'
            Glyph("..#..", ".#.#.", "#...#", ".....", ".....", ".....", "....."),   // 94 '^'
            Glyph(".....", ".....", ".....", ".....", ".....", ".....", "#####"),   // 95 '_'
            Glyph(".#...", "..#..", ".....", ".....", ".....", ".....", "....."),   // 96 '`'
            Glyph(".....", ".....", ".###.", "....#", ".####", "#...#", ".####"),   // 97 'a'
            Glyph("#....", "#....", "####.", "#...#", "#...#", "#...#", "####."),   // 98 'b'
            Glyph(".....", ".....", ".###.", "#....", "#....", "#...#", ".###."),   // 99 'c'
            Glyph("....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"),   // 100 'd'
            Glyph(".....", ".....", ".###.", "#...#", "#####", "#....", ".###."),   // 101 'e'
            Glyph("..##.", ".#..#", ".#...", "####.", ".#...", ".#...", ".#..."),   // 102 'f'
            Glyph(".....", ".####", "#...#", "#...#", ".####", "....#", ".###."),   // 103 'g'
            Glyph("#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"),   // 104 'h'
            Glyph("..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."),   // 105 'i'
            Glyph("...#.", ".....", "..##.", "...#.", "...#.", "#..#.", ".##.."),   // 106 'j'
            Glyph("#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."),   // 107 'k'
            Glyph(".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."),   // 108 'l'
            Glyph(".....", ".....", "##.#.", "#.#.#", "#.#.#", "#...#", "#...#"),   // 109 'm'
            Glyph(".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"),   // 110 'n'
            Glyph(".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."),   // 111 'o'
            Glyph(".....", "####.", "#...#", "#...#", "####.", "#....", "#...."),   // 112 'p'
            Glyph(".....", ".####", "#...#", "#...#", ".####", "....#", "....#"),   // 113 'q'
            Glyph(".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."),   // 114 'r'
            Glyph(".....", ".....", ".####", "#....", ".###.", "....#", "####."),   // 115 's'
            Glyph(".#...", ".#...", "####.", ".#...", ".#...", ".#..#", "..##."),   // 116 't'
            Glyph(".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####"),   // 117 'u'
            Glyph(".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."),   // 118 'v'
            Glyph(".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", ".#.#."),   // 119 'w'
            Glyph(".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"),   // 120 'x'
            Glyph(".....", "#...#", "#...#", "#...#", ".####", "....#", ".###."),   // 121 'y'
            Glyph(".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"),   // 122 'z'
            Glyph("...##", "..#..", "..#..", ".#...", "..#..", "..#..", "...##"),   // 123 '{'
            Glyph("..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),   // 124 '|'
            Glyph("##...", "..#..", "..#..", "...#.", "..#..", "..#..", "##..."),   // 125 '}'
            Glyph(".....", ".....", ".#..#", "#.#.#", "#..#.", ".....", "....."),   // 126 '~'
        };
    }
}
