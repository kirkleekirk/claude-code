using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using CastleMinerZ.Core;
using CastleMinerZ.Items;
using CastleMinerZ.World;

namespace CastleMinerZ.UI
{
    /// <summary>Shared palette, so every screen looks like part of the same game.</summary>
    public static class Theme
    {
        public static readonly Color Background = new Color(10, 12, 16, 220);
        public static readonly Color Panel = new Color(24, 26, 32, 235);
        public static readonly Color PanelEdge = new Color(96, 102, 116);
        public static readonly Color Slot = new Color(38, 41, 50, 230);
        public static readonly Color SlotSelected = new Color(210, 190, 90);
        public static readonly Color Text = new Color(232, 232, 236);
        public static readonly Color TextDim = new Color(150, 154, 166);
        public static readonly Color TextBad = new Color(226, 82, 66);
        public static readonly Color TextGood = new Color(120, 210, 120);
        public static readonly Color Highlight = new Color(64, 132, 214, 200);
        public static readonly Color HealthBar = new Color(206, 58, 48);
        public static readonly Color HealthBack = new Color(50, 22, 20, 210);
    }

    /// <summary>
    /// One screen in the stack: a menu, the HUD, a dialog.
    /// </summary>
    public abstract class GameScreen
    {
        public ScreenManager Manager;

        /// <summary>Draw the screen beneath this one as well.</summary>
        public bool IsPopup;

        /// <summary>Stop advancing the simulation while this screen is on top.</summary>
        public bool PausesGame;

        /// <summary>Hide the mouse cursor and take relative mouse look.</summary>
        public bool CapturesLook;

        public virtual void OnEnter() { }
        public virtual void OnExit() { }
        public virtual void Update(float dt, InputManager input) { }
        public virtual void Draw(SpriteBatch batch, float dt) { }
    }

    /// <summary>
    /// A stack of screens plus the shared assets they draw with.
    ///
    /// Only the top screen gets input. Anything below it still draws if the screen above is
    /// a popup, which is how the pause menu dims the running game behind it and how the
    /// controller-disconnect dialog can appear over any state at all.
    /// </summary>
    public sealed class ScreenManager
    {
        private readonly List<GameScreen> _stack = new List<GameScreen>(8);
        private readonly List<GameScreen> _drawList = new List<GameScreen>(8);

        public GraphicsDevice Device;
        public SpriteBatch Batch;

        /// <summary>The one font in the game. Body text and titles differ only by scale.</summary>
        public Assets.PixelFont Font;

        /// <summary>Integer scale for body text. Sized so the HUD is readable at 720p on a television.</summary>
        public int TextScale = 2;

        /// <summary>Integer scale for titles and banners.</summary>
        public int TitleScale = 4;

        private static readonly Vector2 ShadowOffset = new Vector2(1.0f, 1.0f);

        /// <summary>1x1 white texture, for rectangles and bars.</summary>
        public Texture2D Pixel;

        public Texture2D BlockAtlas;
        public Texture2D ItemAtlas;
        public SoundManager Audio;
        public CastleMinerZGame Game;

        /// <summary>Rect that is guaranteed visible on a television. Everything is laid out inside it.</summary>
        public Rectangle SafeArea;

        public int Count
        {
            get { return _stack.Count; }
        }

        public GameScreen Top
        {
            get { return _stack.Count > 0 ? _stack[_stack.Count - 1] : null; }
        }

        public bool GamePaused
        {
            get
            {
                GameScreen top = Top;
                return top != null && top.PausesGame;
            }
        }

        public bool CapturesLook
        {
            get
            {
                GameScreen top = Top;
                return top != null && top.CapturesLook;
            }
        }

        public void UpdateSafeArea()
        {
            Viewport viewport = Device.Viewport;
#if XBOX360
            // A television can crop up to 10 percent of the signal. The framework reports
            // the guaranteed-visible rect; laying out anywhere else risks the health bar
            // being off the edge of somebody's screen.
            SafeArea = viewport.TitleSafeArea;
#else
            SafeArea = new Rectangle(viewport.X, viewport.Y, viewport.Width, viewport.Height);
#endif
        }

        public void Push(GameScreen screen)
        {
            screen.Manager = this;
            _stack.Add(screen);
            screen.OnEnter();
        }

        public void Pop()
        {
            if (_stack.Count == 0) return;
            GameScreen screen = _stack[_stack.Count - 1];
            _stack.RemoveAt(_stack.Count - 1);
            screen.OnExit();
        }

        public void Clear()
        {
            while (_stack.Count > 0) Pop();
        }

        /// <summary>Replaces the whole stack with one screen. Used when changing game state.</summary>
        public void Reset(GameScreen screen)
        {
            Clear();
            Push(screen);
        }

        public void Update(float dt, InputManager input)
        {
            GameScreen top = Top;
            if (top != null) top.Update(dt, input);
        }

        public void Draw(float dt)
        {
            // Walk down until a non-popup is found, then draw back up from there.
            _drawList.Clear();
            for (int i = _stack.Count - 1; i >= 0; i--)
            {
                _drawList.Add(_stack[i]);
                if (!_stack[i].IsPopup) break;
            }

            for (int i = _drawList.Count - 1; i >= 0; i--)
            {
                _drawList[i].Draw(Batch, dt);
            }
        }

        // ---- Shared drawing helpers -------------------------------------------

        public void FillRect(Rectangle rect, Color colour)
        {
            Batch.Draw(Pixel, rect, colour);
        }

        public void DrawBorder(Rectangle rect, int thickness, Color colour)
        {
            Batch.Draw(Pixel, new Rectangle(rect.X, rect.Y, rect.Width, thickness), colour);
            Batch.Draw(Pixel, new Rectangle(rect.X, rect.Bottom - thickness, rect.Width, thickness), colour);
            Batch.Draw(Pixel, new Rectangle(rect.X, rect.Y, thickness, rect.Height), colour);
            Batch.Draw(Pixel, new Rectangle(rect.Right - thickness, rect.Y, thickness, rect.Height), colour);
        }

        public void DrawPanel(Rectangle rect)
        {
            FillRect(rect, Theme.Panel);
            DrawBorder(rect, 2, Theme.PanelEdge);
        }

        /// <summary>Size of a string in body text.</summary>
        public Vector2 MeasureText(string text)
        {
            return Font == null ? Vector2.Zero : Font.Measure(text, TextScale);
        }

        public Vector2 MeasureTitle(string text)
        {
            return Font == null ? Vector2.Zero : Font.Measure(text, TitleScale);
        }

        public void DrawText(string text, Vector2 position, Color colour)
        {
            if (Font == null) return;
            Font.Draw(Batch, text, position, colour, TextScale);
        }

        /// <summary>Text with a drop shadow, which is what keeps it legible over the world.</summary>
        public void DrawShadowedText(string text, Vector2 position, Color colour)
        {
            if (Font == null) return;
            // A one-pixel shadow at any scale. Offsetting by the full scale makes the text
            // read as bold and smeared rather than as outlined.
            Font.Draw(Batch, text, position + ShadowOffset, new Color(0, 0, 0, 200), TextScale);
            Font.Draw(Batch, text, position, colour, TextScale);
        }

        public void DrawTextCentred(string text, float centreX, float y, Color colour)
        {
            if (Font == null) return;
            Vector2 size = Font.Measure(text, TextScale);
            DrawShadowedText(text, new Vector2(centreX - size.X * 0.5f, y), colour);
        }

        public void DrawTitleCentred(string text, float centreX, float y, Color colour)
        {
            if (Font == null) return;
            Vector2 size = Font.Measure(text, TitleScale);
            Vector2 position = new Vector2(centreX - size.X * 0.5f, y);
            Font.Draw(Batch, text, position + new Vector2(2.0f, 2.0f), new Color(0, 0, 0, 200), TitleScale);
            Font.Draw(Batch, text, position, colour, TitleScale);
        }

        /// <summary>
        /// Draws an item's icon. Blocks use their top face from the terrain atlas; everything
        /// else uses the icon atlas, so one code path covers the whole inventory.
        /// </summary>
        public void DrawItemIcon(byte itemId, Rectangle rect)
        {
            if (itemId == Item.None) return;

            Texture2D texture;
            int tile;
            int tilesPerRow;

            if (Item.IsBlock(itemId))
            {
                texture = BlockAtlas;
                tile = BlockRegistry.Get(itemId).FaceTiles[Face.PosY];
                tilesPerRow = BlockRegistry.AtlasTilesPerRow;
            }
            else
            {
                texture = ItemAtlas;
                tile = ItemRegistry.Get(itemId).IconTile;
                tilesPerRow = ItemRegistry.IconAtlasTilesPerRow;
            }

            if (texture == null) return;

            int tileSize = texture.Width / tilesPerRow;
            Rectangle source = new Rectangle((tile % tilesPerRow) * tileSize, (tile / tilesPerRow) * tileSize, tileSize, tileSize);
            Batch.Draw(texture, rect, source, Color.White);
        }

        /// <summary>Draws one inventory slot: background, icon, stack count.</summary>
        public void DrawSlot(Rectangle rect, ItemStack stack, bool selected)
        {
            FillRect(rect, Theme.Slot);
            DrawBorder(rect, selected ? 3 : 1, selected ? Theme.SlotSelected : Theme.PanelEdge);

            if (stack.IsEmpty) return;

            int inset = rect.Width / 8;
            DrawItemIcon(stack.Id, new Rectangle(rect.X + inset, rect.Y + inset, rect.Width - inset * 2, rect.Height - inset * 2));

            if (stack.Count > 1)
            {
                string count = stack.Count.ToString();
                Vector2 size = MeasureText(count);
                DrawShadowedText(count, new Vector2(rect.Right - size.X - 3, rect.Bottom - size.Y - 1), Theme.Text);
            }
        }
    }
}
