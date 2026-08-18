using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using CastleMinerZ.Core;
using CastleMinerZ.Items;
using CastleMinerZ.World;

namespace CastleMinerZ.UI
{
    /// <summary>
    /// The in-game HUD, and the screen that owns gameplay input.
    ///
    /// Layout is anchored to the title-safe rectangle rather than to the back buffer, so
    /// nothing important lands in the overscan a television crops. The danger readout is
    /// deliberately the loudest element after health: knowing how far out you are is the
    /// single most useful piece of information in the game.
    /// </summary>
    public sealed class HudScreen : GameScreen
    {
        private readonly GameSession _session;
        private float _hotbarHighlight;

        public HudScreen(GameSession session)
        {
            _session = session;
            IsPopup = false;
            PausesGame = false;
            CapturesLook = true;
        }

        public override void Update(float dt, InputManager input)
        {
            if (_hotbarHighlight > 0.0f) _hotbarHighlight -= dt;

            PlayerCommand command = Manager.Game.CurrentCommand;

            if (command.PausePressed)
            {
                Manager.Push(new PauseScreen(_session));
                return;
            }

            if (_session.AwaitingRespawn && _session.DeathTimer > 1.0f)
            {
                Manager.Push(new DeathScreen(_session));
                return;
            }

            if (command.InventoryPressed)
            {
                Manager.Push(new InventoryScreen(_session, false));
                return;
            }

            if (command.CraftPressed)
            {
                Manager.Push(new InventoryScreen(_session, true));
                return;
            }

            if (command.HotbarDelta != 0 || command.HotbarSlot >= 0) _hotbarHighlight = 1.6f;
        }

        public override void Draw(SpriteBatch batch, float dt)
        {
            LocalPlayerDraw();
        }

        private void LocalPlayerDraw()
        {
            Entities.LocalPlayer player = _session.Player;
            Rectangle safe = Manager.SafeArea;

            DrawDamageVignette(player.DamageFlash);
            DrawCrosshair(safe);
            DrawHealth(safe, player);
            DrawDangerReadout(safe, player);
            DrawHotbar(safe, player);
            DrawAmmo(safe, player);
            DrawNotices(safe);
            DrawBanner(safe);

            if (_session.Settings.ShowDebugOverlay) DrawDebug(safe);
        }

        private void DrawDamageVignette(float strength)
        {
            if (strength <= 0.0f) return;
            Viewport viewport = Manager.Device.Viewport;
            byte alpha = (byte)(MathHelper.Clamp(strength, 0.0f, 1.0f) * 120.0f);
            Manager.FillRect(new Rectangle(0, 0, viewport.Width, viewport.Height), new Color((byte)190, (byte)20, (byte)20, alpha));
        }

        private void DrawCrosshair(Rectangle safe)
        {
            Viewport viewport = Manager.Device.Viewport;
            int cx = viewport.Width / 2;
            int cy = viewport.Height / 2;

            Color colour = new Color(240, 240, 240, 190);
            Manager.FillRect(new Rectangle(cx - 9, cy - 1, 7, 2), colour);
            Manager.FillRect(new Rectangle(cx + 2, cy - 1, 7, 2), colour);
            Manager.FillRect(new Rectangle(cx - 1, cy - 9, 2, 7), colour);
            Manager.FillRect(new Rectangle(cx - 1, cy + 2, 2, 7), colour);

            // Mining progress reads as a bar under the crosshair rather than as a block
            // overlay texture, which keeps it visible on every block colour.
            float progress = _session.Player.MiningProgress;
            if (progress > 0.0f)
            {
                Manager.FillRect(new Rectangle(cx - 24, cy + 16, 48, 4), new Color(0, 0, 0, 160));
                Manager.FillRect(new Rectangle(cx - 24, cy + 16, (int)(48 * progress), 4), new Color(230, 210, 90));
            }
        }

        private void DrawHealth(Rectangle safe, Entities.LocalPlayer player)
        {
            int width = 220;
            int height = 18;
            int x = safe.X;
            int y = safe.Bottom - height - 8;

            Manager.FillRect(new Rectangle(x, y, width, height), Theme.HealthBack);

            float fraction = player.MaxHealth > 0 ? (float)player.Health / player.MaxHealth : 0.0f;
            int filled = (int)(width * MathHelper.Clamp(fraction, 0.0f, 1.0f));

            // Health shifts from red to amber as it drops, so a glance is enough.
            Color bar = fraction > 0.5f
                ? Theme.HealthBar
                : Color.Lerp(new Color(224, 150, 40), Theme.HealthBar, fraction * 2.0f);

            Manager.FillRect(new Rectangle(x, y, filled, height), bar);
            Manager.DrawBorder(new Rectangle(x, y, width, height), 1, Theme.PanelEdge);
            Manager.DrawShadowedText(player.Health + " / " + player.MaxHealth,
                new Vector2(x + 6, y - 1), Theme.Text);
        }

        private void DrawDangerReadout(Rectangle safe, Entities.LocalPlayer player)
        {
            DangerTier tier = player.Tier;
            float distance = player.DistanceFromSpawn;

            BiomeId biome = _session.World.Generator.BiomeAt(
                (int)player.Position.X, (int)player.Position.Z);

            string tierText = Biomes.TierName(tier);
            string distanceText = Biomes.Get(biome).Name.ToUpper() + "   -   " + ((int)distance) + "m FROM SPAWN";

            float centreX = safe.X + safe.Width * 0.5f;
            Manager.DrawTextCentred(tierText, centreX, safe.Y + 4, Biomes.TierColour(tier));
            Manager.DrawTextCentred(distanceText, centreX, safe.Y + 26, Theme.TextDim);

            if (_session.World.IsNight)
            {
                Manager.DrawTextCentred("NIGHT", centreX, safe.Y + 48, new Color(150, 160, 220));
            }
        }

        private void DrawHotbar(Rectangle safe, Entities.LocalPlayer player)
        {
            const int slotSize = 52;
            const int gap = 4;

            int total = Inventory.HotbarSlots * slotSize + (Inventory.HotbarSlots - 1) * gap;
            int x = safe.X + (safe.Width - total) / 2;
            int y = safe.Bottom - slotSize - 8;

            for (int i = 0; i < Inventory.HotbarSlots; i++)
            {
                Rectangle rect = new Rectangle(x + i * (slotSize + gap), y, slotSize, slotSize);
                Manager.DrawSlot(rect, player.Inventory[i], i == player.Inventory.SelectedIndex);
            }

            // Name the held item briefly after a change, then let it fade.
            if (_hotbarHighlight > 0.0f)
            {
                ItemStack selected = player.Inventory.Selected;
                if (!selected.IsEmpty)
                {
                    Manager.DrawTextCentred(selected.Definition.Name,
                        safe.X + safe.Width * 0.5f, y - 26, Theme.Text);
                }
            }
        }

        private void DrawAmmo(Rectangle safe, Entities.LocalPlayer player)
        {
            int loaded = player.LoadedRounds;
            if (loaded < 0) return;

            string text = loaded + " / " + player.ReserveRounds;
            Color colour = loaded == 0 ? Theme.TextBad : Theme.Text;

            Vector2 size = Manager.Font != null ? Manager.Font.MeasureString(text) : Vector2.Zero;
            Manager.DrawShadowedText(text, new Vector2(safe.Right - size.X, safe.Bottom - size.Y - 8), colour);

            if (player.IsReloading)
            {
                string reloading = "RELOADING";
                Vector2 reloadSize = Manager.Font != null ? Manager.Font.MeasureString(reloading) : Vector2.Zero;
                Manager.DrawShadowedText(reloading,
                    new Vector2(safe.Right - reloadSize.X, safe.Bottom - size.Y - 30), Theme.TextDim);
            }
        }

        private void DrawNotices(Rectangle safe)
        {
            for (int i = 0; i < _session.NoticeCount; i++)
            {
                GameSession.Notice notice = _session.Notices[i];
                if (notice.TimeLeft <= 0.0f) continue;

                float fade = MathHelper.Clamp(notice.TimeLeft, 0.0f, 1.0f);
                Color colour = new Color(Theme.Text.R, Theme.Text.G, Theme.Text.B, (byte)(fade * 255));
                Manager.DrawShadowedText(notice.Text, new Vector2(safe.X, safe.Bottom - 120 - i * 22), colour);
            }
        }

        private void DrawBanner(Rectangle safe)
        {
            if (_session.BannerTime <= 0.0f || _session.BannerText == null) return;

            float fade = MathHelper.Clamp(_session.BannerTime, 0.0f, 1.0f);
            Color colour = new Color((byte)230, (byte)70, (byte)70, (byte)(fade * 255));
            Manager.DrawTitleCentred(_session.BannerText, safe.X + safe.Width * 0.5f, safe.Y + safe.Height * 0.3f, colour);
        }

        private void DrawDebug(Rectangle safe)
        {
            CastleMinerZGame game = Manager.Game;
            Entities.LocalPlayer player = _session.Player;

            int y = safe.Y + 70;
            DebugLine(safe.X, ref y, "fps " + game.FramesPerSecond.ToString("0"));
            DebugLine(safe.X, ref y, "pos " + (int)player.Position.X + " " + (int)player.Position.Y + " " + (int)player.Position.Z);
            DebugLine(safe.X, ref y, "columns " + _session.World.LoadedColumnCount
                + "  gen-q " + _session.World.Worker.PendingGeneration
                + "  mesh-q " + _session.World.Worker.PendingMesh);
            DebugLine(safe.X, ref y, "generated " + _session.World.Worker.ColumnsGenerated
                + "  meshed " + _session.World.Worker.SectionsMeshed);
            DebugLine(safe.X, ref y, "sections " + game.WorldRenderer.DrawnSections
                + "  tris " + game.WorldRenderer.DrawnTriangles);
            DebugLine(safe.X, ref y, "enemies " + _session.Enemies.Count
                + "  particles " + _session.Particles.LiveCount);
            DebugLine(safe.X, ref y, "time " + _session.World.TimeOfDay.ToString("0.00")
                + "  sun " + _session.World.SunIntensity.ToString("0.00"));
            DebugLine(safe.X, ref y, "pool live " + Pools.SectionBytes.LiveCount
                + "  free " + Pools.SectionBytes.FreeCount);
            DebugLine(safe.X, ref y, "managed " + (System.GC.GetTotalMemory(false) / 1024) + " KB");
        }

        private void DebugLine(int x, ref int y, string text)
        {
            Manager.DrawShadowedText(text, new Vector2(x, y), new Color(180, 230, 180));
            y += 20;
        }
    }
}
