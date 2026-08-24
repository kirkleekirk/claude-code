using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using CastleMinerZ.Entities;
using CastleMinerZ.Items;
using CastleMinerZ.Net;
using CastleMinerZ.World;

namespace CastleMinerZ.Graphics
{
    /// <summary>
    /// Draws everything that is not terrain: creatures, dropped items, projectiles, remote
    /// players, the block-selection outline and the first-person held item.
    ///
    /// Creatures are assembled from boxes at draw time rather than from a skinned model.
    /// That fits the art style, needs no rigging or animation data in the content build,
    /// and means one <see cref="CubeBatch"/> covers the entire horde.
    /// </summary>
    public sealed class EntityRenderer
    {
        private readonly CubeBatch _batch = new CubeBatch();
        private GraphicsDevice _device;
        private BasicEffect _lineEffect;
        private Texture2D _blockAtlas;
        private Texture2D _itemAtlas;

        private readonly VertexPositionColor[] _lineVertices = new VertexPositionColor[48];

        public void LoadContent(GraphicsDevice device, Texture2D blockAtlas, Texture2D itemAtlas)
        {
            _device = device;
            _blockAtlas = blockAtlas;
            _itemAtlas = itemAtlas;
            _batch.LoadContent(device);

            _lineEffect = new BasicEffect(device);
            _lineEffect.VertexColorEnabled = true;
            _lineEffect.LightingEnabled = false;
            _lineEffect.TextureEnabled = false;
        }

        public void Draw(GameSession session, Camera camera)
        {
            DrawCreatures(session, camera);
            DrawBlockDrops(session, camera);
            DrawProjectiles(session, camera);
            DrawSelection(session, camera);
        }

        // ---- Creatures --------------------------------------------------------

        private void DrawCreatures(GameSession session, Camera camera)
        {
            _batch.Begin();

            for (int i = 0; i < session.Enemies.Active.Count; i++)
            {
                Enemy enemy = session.Enemies.Active[i];
                if (enemy.IsDead) continue;

                BoundingBox bounds = enemy.Bounds;
                if (!camera.IsVisible(ref bounds)) continue;

                float light = session.World.SampleLight(enemy.Position + new Vector3(0.0f, enemy.Height * 0.5f, 0.0f));
                Color tint = enemy.Type.Tint;

                // Flash white when hit, so damage reads at a distance without a health bar.
                if (enemy.HurtFlash > 0.0f)
                {
                    float flash = enemy.HurtFlash;
                    tint = new Color(
                        (byte)MathHelper.Lerp(tint.R, 255, flash),
                        (byte)MathHelper.Lerp(tint.G, 90, flash),
                        (byte)MathHelper.Lerp(tint.B, 90, flash));
                }

                if (enemy.Type.Kind == EnemyKind.Dragon) DrawDragon((Dragon)enemy, tint, light);
                else DrawHumanoid(enemy, tint, light);
            }

            DrawRemotePlayers(session);

            _batch.End(camera.View, camera.Projection, null);
        }

        private void DrawHumanoid(Enemy enemy, Color tint, float light)
        {
            float scale = enemy.Height / 1.85f;
            Vector3 feet = enemy.Position;
            float yaw = enemy.Yaw;

            float swing = (float)System.Math.Sin(enemy.AnimPhase) * 0.22f * scale;

            Color skin = tint;
            Color cloth = new Color((byte)(tint.R * 0.65f), (byte)(tint.G * 0.65f), (byte)(tint.B * 0.72f));

            // Legs
            Vector3 legSize = new Vector3(0.22f, 0.85f, 0.25f) * scale;
            _batch.AddBox(Offset(feet, yaw, -0.14f * scale, 0.0f, swing), legSize, yaw, cloth, light);
            _batch.AddBox(Offset(feet, yaw, 0.14f * scale, 0.0f, -swing), legSize, yaw, cloth, light);

            // Torso
            Vector3 torso = feet + new Vector3(0.0f, 0.85f * scale, 0.0f);
            _batch.AddBox(torso, new Vector3(0.58f, 0.62f, 0.32f) * scale, yaw, cloth, light);

            // Arms, held forward in the classic shamble.
            Vector3 armSize = new Vector3(0.2f, 0.68f, 0.22f) * scale;
            float reach = enemy.Type.Ranged ? 0.05f : 0.34f;
            Vector3 leftArm = Offset(feet + new Vector3(0.0f, 0.78f * scale, 0.0f), yaw, -0.38f * scale, reach * scale, -swing);
            Vector3 rightArm = Offset(feet + new Vector3(0.0f, 0.78f * scale, 0.0f), yaw, 0.38f * scale, reach * scale, swing);
            _batch.AddBox(leftArm, armSize, yaw, skin, light);
            _batch.AddBox(rightArm, armSize, yaw, skin, light);

            // Head
            Vector3 head = feet + new Vector3(0.0f, 1.47f * scale, 0.0f);
            _batch.AddBox(head, new Vector3(0.46f, 0.46f, 0.46f) * scale, yaw, skin, light);

            // Eyes: two small dark boxes on the front face, which is what makes a box read
            // as a creature and gives the player a facing cue.
            Vector3 eyeBase = head + new Vector3(0.0f, 0.22f * scale, 0.0f);
            Color eyes = enemy.Type.Kind == EnemyKind.Skeleton ? new Color(20, 20, 20) : new Color(180, 40, 30);
            _batch.AddBox(Offset(eyeBase, yaw, -0.12f * scale, 0.24f * scale, 0.0f),
                new Vector3(0.1f, 0.09f, 0.04f) * scale, yaw, eyes, 1.0f);
            _batch.AddBox(Offset(eyeBase, yaw, 0.12f * scale, 0.24f * scale, 0.0f),
                new Vector3(0.1f, 0.09f, 0.04f) * scale, yaw, eyes, 1.0f);
        }

        private void DrawDragon(Dragon dragon, Color tint, float light)
        {
            Vector3 centre = dragon.Position;
            float yaw = dragon.Yaw;
            Color dark = new Color((byte)(tint.R * 0.7f), (byte)(tint.G * 0.7f), (byte)(tint.B * 0.7f));

            _batch.AddBox(centre, new Vector3(1.1f, 0.8f, 2.6f), yaw, tint, light);

            // Neck and head, out along the facing direction.
            _batch.AddBox(Offset(centre, yaw, 0.0f, 1.5f, 0.25f), new Vector3(0.6f, 0.55f, 1.0f), yaw, tint, light);
            _batch.AddBox(Offset(centre, yaw, 0.0f, 2.3f, 0.35f), new Vector3(0.7f, 0.6f, 0.9f), yaw, dark, light);

            // Glowing eyes.
            _batch.AddBox(Offset(centre, yaw, -0.2f, 2.7f, 0.55f), new Vector3(0.14f, 0.12f, 0.08f), yaw, new Color(255, 170, 60), 1.0f);
            _batch.AddBox(Offset(centre, yaw, 0.2f, 2.7f, 0.55f), new Vector3(0.14f, 0.12f, 0.08f), yaw, new Color(255, 170, 60), 1.0f);

            // Wings. Yaw-only boxes cannot hinge, so the flap is expressed as vertical
            // travel plus a slight spread -- enough to read as beating at this scale.
            float flap = dragon.WingAngle;
            _batch.AddBox(Offset(centre, yaw, -1.9f, -0.2f, 0.45f + flap * 0.6f), new Vector3(2.4f, 0.14f, 1.3f), yaw, dark, light);
            _batch.AddBox(Offset(centre, yaw, 1.9f, -0.2f, 0.45f + flap * 0.6f), new Vector3(2.4f, 0.14f, 1.3f), yaw, dark, light);

            // Tail.
            _batch.AddBox(Offset(centre, yaw, 0.0f, -2.0f, 0.3f), new Vector3(0.4f, 0.35f, 1.6f), yaw, dark, light);
        }

        /// <summary>Offsets a point in the entity's local frame: right, forward, up.</summary>
        private static Vector3 Offset(Vector3 origin, float yaw, float right, float forward, float up)
        {
            float sin = (float)System.Math.Sin(yaw);
            float cos = (float)System.Math.Cos(yaw);
            return new Vector3(
                origin.X + right * cos + forward * sin,
                origin.Y + up,
                origin.Z - right * sin + forward * cos);
        }

        private void DrawRemotePlayers(GameSession session)
        {
            RemotePlayer[] remotes = session.Network.Remotes;
            for (int i = 0; i < remotes.Length; i++)
            {
                if (!remotes[i].Active) continue;

                float light = session.World.SampleLight(remotes[i].Position + new Vector3(0.0f, 1.0f, 0.0f));
                Color colour = PlayerColour(i);
                Vector3 feet = remotes[i].Position;
                float yaw = remotes[i].Yaw;

                _batch.AddBox(Offset(feet, yaw, -0.14f, 0.0f, 0.0f), new Vector3(0.22f, 0.85f, 0.25f), yaw, new Color(60, 70, 120), light);
                _batch.AddBox(Offset(feet, yaw, 0.14f, 0.0f, 0.0f), new Vector3(0.22f, 0.85f, 0.25f), yaw, new Color(60, 70, 120), light);
                _batch.AddBox(feet + new Vector3(0.0f, 0.85f, 0.0f), new Vector3(0.58f, 0.62f, 0.32f), yaw, colour, light);
                _batch.AddBox(feet + new Vector3(0.0f, 1.47f, 0.0f), new Vector3(0.46f, 0.46f, 0.46f), yaw, new Color(214, 175, 140), light);
            }
        }

        private static Color PlayerColour(int index)
        {
            switch (index)
            {
                case 1: return new Color(200, 70, 70);
                case 2: return new Color(70, 160, 200);
                case 3: return new Color(210, 180, 60);
                default: return new Color(80, 190, 90);
            }
        }

        // ---- Dropped items and projectiles ------------------------------------

        private void DrawBlockDrops(GameSession session, Camera camera)
        {
            ItemDrop[] drops = session.Drops.Items;

            // Block drops are drawn with the terrain atlas, everything else with the icon
            // atlas, so each texture needs its own batch.
            _batch.Begin();
            for (int i = 0; i < drops.Length; i++)
            {
                if (!drops[i].Alive) continue;
                if (!Item.IsBlock(drops[i].ItemId)) continue;

                BlockDefinition block = BlockRegistry.Get(drops[i].ItemId);
                float light = session.World.SampleLight(drops[i].Position);
                float bob = (float)System.Math.Sin(drops[i].Spin * 1.7f) * 0.06f;

                _batch.AddTexturedBox(drops[i].Position + new Vector3(0.0f, bob, 0.0f),
                    new Vector3(0.3f, 0.3f, 0.3f), drops[i].Spin, Color.White, light,
                    block.FaceTiles[Face.PosY], BlockRegistry.AtlasTilesPerRow);
            }
            _batch.End(camera.View, camera.Projection, _blockAtlas);

            _batch.Begin();
            for (int i = 0; i < drops.Length; i++)
            {
                if (!drops[i].Alive) continue;
                if (Item.IsBlock(drops[i].ItemId)) continue;

                ItemDefinition def = ItemRegistry.Get(drops[i].ItemId);
                float light = session.World.SampleLight(drops[i].Position);
                float bob = (float)System.Math.Sin(drops[i].Spin * 1.7f) * 0.06f;

                _batch.AddTexturedBox(drops[i].Position + new Vector3(0.0f, bob, 0.0f),
                    new Vector3(0.3f, 0.3f, 0.06f), drops[i].Spin, Color.White, light,
                    def.IconTile, ItemRegistry.IconAtlasTilesPerRow);
            }
            _batch.End(camera.View, camera.Projection, _itemAtlas);
        }

        private void DrawProjectiles(GameSession session, Camera camera)
        {
            Projectile[] projectiles = session.Projectiles.Items;

            _batch.Begin();
            for (int i = 0; i < projectiles.Length; i++)
            {
                if (!projectiles[i].Alive) continue;

                Vector3 size;
                Color colour;
                switch (projectiles[i].Kind)
                {
                    case ProjectileKind.Fireball:
                        size = new Vector3(0.3f, 0.3f, 0.3f);
                        colour = new Color(255, 150, 50);
                        break;
                    case ProjectileKind.Rocket:
                        size = new Vector3(0.18f, 0.18f, 0.5f);
                        colour = new Color(190, 190, 190);
                        break;
                    default:
                        size = new Vector3(0.08f, 0.08f, 0.45f);
                        colour = new Color(226, 222, 208);
                        break;
                }

                float yaw = (float)System.Math.Atan2(projectiles[i].Velocity.X, projectiles[i].Velocity.Z);
                _batch.AddBox(projectiles[i].Position, size, yaw, colour, 1.0f);
            }
            _batch.End(camera.View, camera.Projection, null);
        }

        // ---- Selection outline ------------------------------------------------

        /// <summary>Wireframe box around the block under the crosshair.</summary>
        private void DrawSelection(GameSession session, Camera camera)
        {
            LocalPlayer player = session.Player;
            if (!player.HasTarget || player.IsDead) return;

            Vector3 min = new Vector3(player.TargetX, player.TargetY, player.TargetZ) - new Vector3(0.002f);
            Vector3 max = min + new Vector3(1.004f);

            // Brighten the outline as the block gets closer to breaking.
            float progress = player.MiningProgress;
            Color colour = new Color(
                (byte)(30 + 225 * progress),
                (byte)(30 + 40 * progress),
                (byte)30,
                (byte)200);

            int v = 0;
            AddEdge(ref v, new Vector3(min.X, min.Y, min.Z), new Vector3(max.X, min.Y, min.Z), colour);
            AddEdge(ref v, new Vector3(max.X, min.Y, min.Z), new Vector3(max.X, min.Y, max.Z), colour);
            AddEdge(ref v, new Vector3(max.X, min.Y, max.Z), new Vector3(min.X, min.Y, max.Z), colour);
            AddEdge(ref v, new Vector3(min.X, min.Y, max.Z), new Vector3(min.X, min.Y, min.Z), colour);

            AddEdge(ref v, new Vector3(min.X, max.Y, min.Z), new Vector3(max.X, max.Y, min.Z), colour);
            AddEdge(ref v, new Vector3(max.X, max.Y, min.Z), new Vector3(max.X, max.Y, max.Z), colour);
            AddEdge(ref v, new Vector3(max.X, max.Y, max.Z), new Vector3(min.X, max.Y, max.Z), colour);
            AddEdge(ref v, new Vector3(min.X, max.Y, max.Z), new Vector3(min.X, max.Y, min.Z), colour);

            AddEdge(ref v, new Vector3(min.X, min.Y, min.Z), new Vector3(min.X, max.Y, min.Z), colour);
            AddEdge(ref v, new Vector3(max.X, min.Y, min.Z), new Vector3(max.X, max.Y, min.Z), colour);
            AddEdge(ref v, new Vector3(max.X, min.Y, max.Z), new Vector3(max.X, max.Y, max.Z), colour);
            AddEdge(ref v, new Vector3(min.X, min.Y, max.Z), new Vector3(min.X, max.Y, max.Z), colour);

            _lineEffect.View = camera.View;
            _lineEffect.Projection = camera.Projection;
            _lineEffect.World = Matrix.Identity;

            _device.DepthStencilState = DepthStencilState.DepthRead;
            _device.BlendState = BlendState.AlphaBlend;

            for (int p = 0; p < _lineEffect.CurrentTechnique.Passes.Count; p++)
            {
                _lineEffect.CurrentTechnique.Passes[p].Apply();
                _device.DrawUserPrimitives(PrimitiveType.LineList, _lineVertices, 0, v / 2);
            }

            _device.DepthStencilState = DepthStencilState.Default;
            _device.BlendState = BlendState.Opaque;
        }

        private void AddEdge(ref int index, Vector3 a, Vector3 b, Color colour)
        {
            _lineVertices[index++] = new VertexPositionColor(a, colour);
            _lineVertices[index++] = new VertexPositionColor(b, colour);
        }

        // ---- First-person held item -------------------------------------------

        /// <summary>
        /// Draws the held item in view space so it never intersects the world, using a
        /// dedicated near-plane projection to stop it clipping through walls.
        /// </summary>
        public void DrawHeldItem(GameSession session, Camera camera)
        {
            LocalPlayer player = session.Player;
            if (player.IsDead) return;

            ItemStack held = player.Inventory.Selected;
            if (held.IsEmpty) return;

            ItemDefinition def = held.Definition;

            Matrix view = Matrix.Identity;
            Matrix projection = Matrix.CreatePerspectiveFieldOfView(
                camera.FieldOfView * 0.85f, camera.AspectRatio, 0.02f, 6.0f);

            float bob = player.WeaponBob;
            float swing = player.MiningProgress > 0.0f
                ? (float)System.Math.Sin(player.MiningProgress * 22.0f) * 0.09f
                : 0.0f;

            // View space: +X right, +Y up, -Z forward. Pushed down and to the right so the
            // item sits in the corner rather than over the middle of the view, and far
            // enough back that it takes up roughly a quarter of the screen height.
            Vector3 position = new Vector3(0.52f, -0.62f + bob + swing, -1.05f);
            float light = session.World.SampleLight(player.EyePosition);
            if (light < 0.35f) light = 0.35f;

            _device.Clear(ClearOptions.DepthBuffer, Color.Black, 1.0f, 0);
            _batch.Begin();

            if (def.IsPlaceable)
            {
                _batch.AddTexturedBox(position, new Vector3(0.34f, 0.34f, 0.34f), 0.7f, Color.White, light,
                    BlockRegistry.Get(def.PlacesBlock).FaceTiles[Face.PosY], BlockRegistry.AtlasTilesPerRow);
                _batch.End(view, projection, _blockAtlas);
            }
            else if (def.IsFirearm)
            {
                // Blocky gun silhouette: receiver, barrel, grip.
                _batch.AddBox(position, new Vector3(0.12f, 0.14f, 0.5f), 0.0f, new Color(48, 48, 52), light);
                _batch.AddBox(position + new Vector3(0.0f, 0.05f, -0.36f), new Vector3(0.06f, 0.06f, 0.36f), 0.0f, new Color(32, 32, 36), light);
                _batch.AddBox(position + new Vector3(0.0f, -0.2f, 0.12f), new Vector3(0.09f, 0.22f, 0.14f), 0.0f, new Color(70, 52, 36), light);
                _batch.End(view, projection, null);
            }
            else
            {
                // Tools and materials show their icon on a thin slab, angled slightly so it
                // reads as an object being held rather than as a sticker on the screen.
                _batch.AddTexturedBox(position, new Vector3(0.36f, 0.36f, 0.04f), 0.22f, Color.White, light,
                    def.IconTile, ItemRegistry.IconAtlasTilesPerRow);
                _batch.End(view, projection, _itemAtlas);
            }
        }
    }
}
