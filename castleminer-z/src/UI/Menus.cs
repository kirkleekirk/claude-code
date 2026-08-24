using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using CastleMinerZ.Core;
using CastleMinerZ.World;

namespace CastleMinerZ.UI
{
    /// <summary>One selectable line in a menu. <see cref="Value"/> is the right-hand column for settings.</summary>
    public sealed class MenuEntry
    {
        public string Text;
        public string Value;
        public bool Enabled = true;

        public MenuEntry(string text)
        {
            Text = text;
        }
    }

    /// <summary>
    /// Base class for the vertical menus.
    ///
    /// Navigation is d-pad/stick and A/B only. Every screen in the game is reachable and
    /// operable without a keyboard, because on the target platform there isn't one.
    /// </summary>
    public abstract class MenuScreen : GameScreen
    {
        protected readonly List<MenuEntry> Entries = new List<MenuEntry>(8);
        protected string Title;
        protected string Subtitle;
        protected int Selected;

        protected MenuScreen(string title)
        {
            Title = title;
            IsPopup = true;
            PausesGame = true;
            CapturesLook = false;
        }

        protected abstract void OnAccept(int index);

        protected virtual void OnCancel() { }

        /// <summary>Left/right on an entry. Used by the options screen for sliders and toggles.</summary>
        protected virtual void OnAdjust(int index, int direction) { }

        /// <summary>Refresh the right-hand values before drawing.</summary>
        protected virtual void RefreshValues() { }

        public override void Update(float dt, InputManager input)
        {
            int vertical = input.MenuVertical();
            if (vertical != 0 && Entries.Count > 0)
            {
                int start = Selected;
                do
                {
                    Selected += vertical;
                    if (Selected < 0) Selected = Entries.Count - 1;
                    if (Selected >= Entries.Count) Selected = 0;
                }
                while (!Entries[Selected].Enabled && Selected != start);

                Manager.Audio.Play2D(SoundId.MenuMove, 0.5f, 0.0f);
            }

            int horizontal = input.MenuHorizontal();
            if (horizontal != 0)
            {
                OnAdjust(Selected, horizontal);
                Manager.Audio.Play2D(SoundId.MenuMove, 0.4f, 0.2f);
            }

            if (input.MenuAccept() && Entries.Count > 0 && Entries[Selected].Enabled)
            {
                Manager.Audio.Play2D(SoundId.MenuSelect, 0.7f, 0.0f);
                OnAccept(Selected);
                return;
            }

            if (input.MenuCancel())
            {
                Manager.Audio.Play2D(SoundId.MenuSelect, 0.5f, -0.3f);
                OnCancel();
            }
        }

        public override void Draw(SpriteBatch batch, float dt)
        {
            RefreshValues();

            Rectangle safe = Manager.SafeArea;
            Viewport viewport = Manager.Device.Viewport;
            Manager.FillRect(new Rectangle(0, 0, viewport.Width, viewport.Height), Theme.Background);

            float centreX = safe.X + safe.Width * 0.5f;
            float y = safe.Y + safe.Height * 0.18f;

            Manager.DrawTitleCentred(Title, centreX, y, Theme.Text);
            y += 56;

            if (Subtitle != null)
            {
                Manager.DrawTextCentred(Subtitle, centreX, y, Theme.TextDim);
                y += 34;
            }

            y += 12;

            for (int i = 0; i < Entries.Count; i++)
            {
                MenuEntry entry = Entries[i];
                bool selected = i == Selected;

                Color colour = !entry.Enabled ? new Color(90, 92, 100)
                    : selected ? Theme.SlotSelected : Theme.Text;

                if (selected)
                {
                    Rectangle highlight = new Rectangle((int)(centreX - 230), (int)y - 4, 460, 30);
                    Manager.FillRect(highlight, Theme.Highlight);
                }

                if (entry.Value == null)
                {
                    Manager.DrawTextCentred(entry.Text, centreX, y, colour);
                }
                else
                {
                    Manager.DrawShadowedText(entry.Text, new Vector2(centreX - 210, y), colour);
                    Vector2 size = Manager.MeasureText(entry.Value);
                    Manager.DrawShadowedText(entry.Value, new Vector2(centreX + 210 - size.X, y), colour);
                }

                y += 34;
            }

            DrawFooter(safe, centreX);
        }

        protected virtual void DrawFooter(Rectangle safe, float centreX)
        {
            Manager.DrawTextCentred("(A) SELECT     (B) BACK", centreX, safe.Bottom - 34, Theme.TextDim);
        }
    }

    /// <summary>Title screen.</summary>
    public sealed class MainMenuScreen : MenuScreen
    {
        private const int NewGame = 0;
        private const int Continue = 1;
        private const int HostCoop = 2;
        private const int JoinCoop = 3;
        private const int Options = 4;
        private const int Exit = 5;

        public MainMenuScreen() : base("CASTLEMINER Z")
        {
            IsPopup = false;
            Subtitle = "MINE. BUILD. SURVIVE. GO FURTHER.";

            Entries.Add(new MenuEntry("NEW WORLD"));
            Entries.Add(new MenuEntry("CONTINUE"));
            Entries.Add(new MenuEntry("HOST CO-OP"));
            Entries.Add(new MenuEntry("JOIN CO-OP"));
            Entries.Add(new MenuEntry("OPTIONS"));
            Entries.Add(new MenuEntry("EXIT"));
        }

        public override void OnEnter()
        {
#if !XNA_NET
            // No session layer outside the XNA build.
            Entries[HostCoop].Enabled = false;
            Entries[JoinCoop].Enabled = false;
#endif
            RefreshValues();
            if (!Entries[Selected].Enabled) Selected = NewGame;
        }

        protected override void RefreshValues()
        {
            // Re-checked every frame rather than only on entry: on Xbox the storage device
            // is chosen asynchronously through the guide, so whether a save exists is not
            // known until several frames after this screen first appears.
            Entries[Continue].Enabled = Manager.Game.HasSaveFile;
        }

        protected override void OnAccept(int index)
        {
            switch (index)
            {
                case NewGame:
                    Manager.Game.StartNewGame();
                    break;

                case Continue:
                    Manager.Game.LoadSavedGame();
                    break;

                case HostCoop:
                    Manager.Game.StartNewGame();
                    Manager.Game.HostCoopSession();
                    break;

                case JoinCoop:
                    Manager.Push(new MessageScreen("CO-OP",
                        "Searching for sessions is only available in the Xbox LIVE build.", true));
                    break;

                case Options:
                    Manager.Push(new OptionsScreen(Manager.Game.Settings));
                    break;

                case Exit:
                    Manager.Game.RequestExit();
                    break;
            }
        }

        protected override void DrawFooter(Rectangle safe, float centreX)
        {
            Manager.DrawTextCentred("(A) SELECT", centreX, safe.Bottom - 34, Theme.TextDim);
        }
    }

    /// <summary>In-game pause menu.</summary>
    public sealed class PauseScreen : MenuScreen
    {
        private readonly GameSession _session;

        public PauseScreen(GameSession session) : base("PAUSED")
        {
            _session = session;
            Entries.Add(new MenuEntry("RESUME"));
            Entries.Add(new MenuEntry("CRAFTING"));
            Entries.Add(new MenuEntry("OPTIONS"));
            Entries.Add(new MenuEntry("SAVE"));
            Entries.Add(new MenuEntry("SAVE AND QUIT"));
        }

        protected override void RefreshValues()
        {
            Subtitle = "DAY " + (_session.Stats.DaysSurvived + 1)
                + "     " + _session.Stats.Kills + " KILLS"
                + "     " + (int)_session.Stats.FurthestDistance + "m OUT";
        }

        protected override void OnAccept(int index)
        {
            switch (index)
            {
                case 0:
                    Manager.Pop();
                    break;
                case 1:
                    Manager.Push(new InventoryScreen(_session, true));
                    break;
                case 2:
                    Manager.Push(new OptionsScreen(Manager.Game.Settings));
                    break;
                case 3:
                    Manager.Game.SaveGame();
                    Manager.Push(new MessageScreen("SAVED", "Your world has been saved.", true));
                    break;
                case 4:
                    Manager.Game.SaveGame();
                    Manager.Game.ReturnToMainMenu();
                    break;
            }
        }

        protected override void OnCancel()
        {
            Manager.Pop();
        }
    }

    /// <summary>Settings. Left/right adjusts, so it works entirely from a pad.</summary>
    public sealed class OptionsScreen : MenuScreen
    {
        private readonly GameSettings _settings;

        public OptionsScreen(GameSettings settings) : base("OPTIONS")
        {
            _settings = settings;
            Subtitle = "LEFT / RIGHT TO ADJUST";

            Entries.Add(new MenuEntry("LOOK SENSITIVITY"));
            Entries.Add(new MenuEntry("INVERT Y"));
            Entries.Add(new MenuEntry("VIEW DISTANCE"));
            Entries.Add(new MenuEntry("MASTER VOLUME"));
            Entries.Add(new MenuEntry("RUMBLE"));
            Entries.Add(new MenuEntry("DROP ITEMS ON DEATH"));
            Entries.Add(new MenuEntry("DEBUG OVERLAY"));
            Entries.Add(new MenuEntry("BACK"));
        }

        protected override void RefreshValues()
        {
            Entries[0].Value = _settings.LookSensitivity.ToString("0.0");
            Entries[1].Value = _settings.InvertY ? "ON" : "OFF";
            Entries[2].Value = _settings.ViewRadius + " CHUNKS";
            Entries[3].Value = (int)(_settings.MasterVolume * 100) + "%";
            Entries[4].Value = _settings.Rumble ? "ON" : "OFF";
            Entries[5].Value = _settings.DropItemsOnDeath ? "ON" : "OFF";
            Entries[6].Value = _settings.ShowDebugOverlay ? "ON" : "OFF";
            Entries[7].Value = null;
        }

        protected override void OnAdjust(int index, int direction)
        {
            switch (index)
            {
                case 0:
                    _settings.LookSensitivity = MathHelper.Clamp(_settings.LookSensitivity + direction * 0.2f, 1.0f, 8.0f);
                    break;
                case 1:
                    _settings.InvertY = !_settings.InvertY;
                    break;
                case 2:
                    // The upper bound is the memory ceiling, not a taste setting: past this
                    // the resident chunk set stops fitting in the console's budget.
                    _settings.ViewRadius = (int)MathHelper.Clamp(_settings.ViewRadius + direction, 3, MaxViewRadius);
                    Manager.Game.ApplySettings();
                    break;
                case 3:
                    _settings.MasterVolume = MathHelper.Clamp(_settings.MasterVolume + direction * 0.05f, 0.0f, 1.0f);
                    Manager.Game.ApplySettings();
                    break;
                case 4:
                    _settings.Rumble = !_settings.Rumble;
                    break;
                case 5:
                    _settings.DropItemsOnDeath = !_settings.DropItemsOnDeath;
                    break;
                case 6:
                    _settings.ShowDebugOverlay = !_settings.ShowDebugOverlay;
                    break;
            }
        }

        private static int MaxViewRadius
        {
            get
            {
#if XBOX360
                return 8;
#else
                return 16;
#endif
            }
        }

        protected override void OnAccept(int index)
        {
            if (index == Entries.Count - 1) Manager.Pop();
            else OnAdjust(index, 1);
        }

        protected override void OnCancel()
        {
            Manager.Game.ApplySettings();
            Manager.Pop();
        }
    }

    /// <summary>Shown after the player dies.</summary>
    public sealed class DeathScreen : MenuScreen
    {
        private readonly GameSession _session;

        public DeathScreen(GameSession session) : base("YOU DIED")
        {
            _session = session;
            Entries.Add(new MenuEntry("RESPAWN AT SPAWN"));
            Entries.Add(new MenuEntry("SAVE AND QUIT"));
        }

        protected override void RefreshValues()
        {
            Subtitle = "YOU FELL " + (int)_session.Player.DistanceFromSpawn + "m FROM SPAWN"
                + "     TIER " + Biomes.TierName(_session.Player.Tier);
        }

        protected override void OnAccept(int index)
        {
            if (index == 0)
            {
                _session.Respawn();
                Manager.Pop();
            }
            else
            {
                Manager.Game.SaveGame();
                Manager.Game.ReturnToMainMenu();
            }
        }

        protected override void DrawFooter(Rectangle safe, float centreX)
        {
            if (_session.Settings.DropItemsOnDeath)
            {
                Manager.DrawTextCentred("YOUR GEAR IS WHERE YOU FELL", centreX, safe.Bottom - 60, Theme.TextBad);
            }
            base.DrawFooter(safe, centreX);
        }
    }

    /// <summary>
    /// Modal message. Also used for the controller-disconnect dialog, which the console
    /// requires and which must not be dismissable while the pad is still unplugged.
    /// </summary>
    public sealed class MessageScreen : GameScreen
    {
        private readonly string _title;
        private readonly string _message;
        private readonly bool _dismissable;

        /// <summary>Returns true while the dialog should stay up.</summary>
        public delegate bool StayOpenPredicate();

        /// <summary>
        /// When set, the screen closes itself as soon as this returns false and cannot be
        /// dismissed by the player. That is exactly the behaviour the controller-disconnect
        /// dialog needs: it goes away when the pad comes back, and not before.
        /// </summary>
        public StayOpenPredicate StayOpenWhile;

        public MessageScreen(string title, string message, bool dismissable)
        {
            _title = title;
            _message = message;
            _dismissable = dismissable;
            IsPopup = true;
            PausesGame = true;
            CapturesLook = false;
        }

        public override void Update(float dt, InputManager input)
        {
            if (StayOpenWhile != null)
            {
                if (!StayOpenWhile()) Manager.Pop();
                return;
            }

            if (_dismissable && (input.MenuAccept() || input.MenuCancel())) Manager.Pop();
        }

        public override void Draw(SpriteBatch batch, float dt)
        {
            Rectangle safe = Manager.SafeArea;
            Viewport viewport = Manager.Device.Viewport;
            Manager.FillRect(new Rectangle(0, 0, viewport.Width, viewport.Height), Theme.Background);

            int width = 620;
            int height = 220;
            Rectangle panel = new Rectangle(
                safe.X + (safe.Width - width) / 2,
                safe.Y + (safe.Height - height) / 2,
                width, height);

            Manager.DrawPanel(panel);

            float centreX = panel.X + panel.Width * 0.5f;
            Manager.DrawTitleCentred(_title, centreX, panel.Y + 28, Theme.Text);
            Manager.DrawTextCentred(_message, centreX, panel.Y + 108, Theme.TextDim);

            if (_dismissable && StayOpenWhile == null)
            {
                Manager.DrawTextCentred("(A) OK", centreX, panel.Bottom - 44, Theme.TextDim);
            }
        }
    }
}
