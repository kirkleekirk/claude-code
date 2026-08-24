using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
#if XBOX360
using Microsoft.Xna.Framework.GamerServices;
#endif
using CastleMinerZ.Assets;
using CastleMinerZ.Core;
using CastleMinerZ.Graphics;
using CastleMinerZ.Net;
using CastleMinerZ.Save;
using CastleMinerZ.UI;

namespace CastleMinerZ
{
    /// <summary>
    /// Game root: device setup, content, the screen stack, and the frame loop.
    ///
    /// The console targets 1280x720 with no multisampling. That is not a compromise on
    /// quality so much as an acknowledgement of the hardware: the Xbox 360's 10 MB of EDRAM
    /// holds a 720p colour and depth buffer without tiling, and turning on MSAA forces
    /// predicated tiling, which means submitting the whole scene twice. For a renderer whose
    /// cost is dominated by chunk draw calls, that is the single most expensive setting
    /// available.
    /// </summary>
    public sealed class CastleMinerZGame : Game
    {
        private readonly GraphicsDeviceManager _graphics;

        private readonly InputManager _input = new InputManager();
        private readonly SoundManager _audio = new SoundManager();
        private readonly SaveManager _save = new SaveManager();
        private readonly ScreenManager _screens = new ScreenManager();
        private readonly NetworkManager _network = new NetworkManager();

        private readonly SkyRenderer _sky = new SkyRenderer();
        private readonly WorldRenderer _worldRenderer = new WorldRenderer();
        private readonly EntityRenderer _entityRenderer = new EntityRenderer();
        private readonly Camera _camera = new Camera();

        private GameSettings _settings = new GameSettings();
        private GameSession _session;

        private Texture2D _blockAtlas;
        private Texture2D _itemAtlas;
        private Texture2D _particleTexture;
        private Texture2D _pixel;
        private Effect _voxelEffect;
        private PixelFont _font;

        private PlayerCommand _command;
        private float _animationTime;
        private bool _hasSaveFile;
        private bool _saveStateChecked;
        private bool _disconnectDialogOpen;

        private float _fpsAccumulator;
        private int _fpsFrames;

        public float FramesPerSecond { get; private set; }

        // ---- Automated capture -------------------------------------------------
        // Used by tools/screenshot.sh to prove the renderer works without a human at the
        // controls. Harmless in a normal run: all three fields stay at their defaults.

        /// <summary>When set, start a world immediately instead of showing the title screen.</summary>
        public int AutoStartSeed = int.MinValue;

        /// <summary>Where to write a screenshot, or null for none.</summary>
        public string ScreenshotPath;

        /// <summary>Frame number at which to take the screenshot and exit.</summary>
        public int ScreenshotFrame = -1;

        /// <summary>Game seconds to simulate before capturing, so terrain has time to stream in.</summary>
        public float WarmUpSeconds;

        /// <summary>Camera pitch to force in capture mode, in radians.</summary>
        public float CapturePitch;
        public bool HasCapturePitch;

        /// <summary>Time of day to force in capture mode: 0 is midnight, 0.5 noon.</summary>
        public float CaptureTime = -1.0f;

        /// <summary>When set, write the generated art out as PNGs and exit.</summary>
        public string DumpAssetsPath;

        private int _frameCounter;

        public CastleMinerZGame()
        {
            _graphics = new GraphicsDeviceManager(this);
            _graphics.GraphicsProfile = GraphicsProfile.HiDef;

#if XBOX360
            _graphics.PreferredBackBufferWidth = 1280;
            _graphics.PreferredBackBufferHeight = 720;
            _graphics.IsFullScreen = true;
#else
            _graphics.PreferredBackBufferWidth = 1280;
            _graphics.PreferredBackBufferHeight = 720;
            Window.AllowUserResizing = true;
#endif
            _graphics.PreferMultiSampling = false;
            _graphics.SynchronizeWithVerticalRetrace = true;

            // The simulation runs on its own fixed step, so the frame loop is free to run
            // as fast as the display allows and to drop frames without changing gameplay.
            IsFixedTimeStep = false;

            Content.RootDirectory = "Content";

#if XBOX360
            // Required for the storage device selector and for LIVE sessions.
            Components.Add(new GamerServicesComponent(this));
#endif
        }

        public GameSettings Settings
        {
            get { return _settings; }
        }

        public GameSession Session
        {
            get { return _session; }
        }

        public PlayerCommand CurrentCommand
        {
            get { return _command; }
        }

        public WorldRenderer WorldRenderer
        {
            get { return _worldRenderer; }
        }

        public bool HasSaveFile
        {
            get { return _hasSaveFile; }
        }

        protected override void Initialize()
        {
            World.BlockRegistry.Initialise();
            World.Biomes.Initialise();
            Items.ItemRegistry.Initialise();
            Items.RecipeBook.Initialise();
            Entities.EnemyManager.InitialiseTypes();

            _save.RequestStorageDevice();
            base.Initialize();
        }

        protected override void LoadContent()
        {
            _screens.Device = GraphicsDevice;
            _screens.Batch = new SpriteBatch(GraphicsDevice);
            _screens.Audio = _audio;
            _screens.Game = this;

            _pixel = new Texture2D(GraphicsDevice, 1, 1);
            _pixel.SetData(new Color[] { Color.White });
            _screens.Pixel = _pixel;

            // All art, audio and text is generated here rather than loaded. Nothing in the
            // game is a content-pipeline asset except the shader, and only the XNA builds
            // need that one.
            _blockAtlas = TextureFactory.CreateBlockAtlas(GraphicsDevice);
            _itemAtlas = TextureFactory.CreateItemAtlas(GraphicsDevice);
            _particleTexture = TextureFactory.CreateParticle(GraphicsDevice);
            _screens.BlockAtlas = _blockAtlas;
            _screens.ItemAtlas = _itemAtlas;

            _font = new PixelFont();
            _font.Build(GraphicsDevice);
            _screens.Font = _font;

            _voxelEffect = LoadVoxelEffect();
            _audio.Initialise();
            _sky.LoadContent(GraphicsDevice);
            _worldRenderer.LoadContent(GraphicsDevice, _voxelEffect, _blockAtlas);
            _entityRenderer.LoadContent(GraphicsDevice, _blockAtlas, _itemAtlas);

            _screens.UpdateSafeArea();
            ApplySettings();

            if (DumpAssetsPath != null)
            {
                DumpGeneratedAssets();
                return;
            }

            if (AutoStartSeed != int.MinValue) StartNewGame(AutoStartSeed);
            else _screens.Reset(new MainMenuScreen());
        }

        /// <summary>
        /// Loads the terrain shader on the XNA builds. The MonoGame configuration renders
        /// with the framework's built-in effects and has no shader to load, which is what
        /// removes its content build entirely.
        /// </summary>
        private Effect LoadVoxelEffect()
        {
#if MONOGAME
            return null;
#else
            return Content.Load<Effect>("Shaders/Voxel");
#endif
        }

        // ---- Session lifecycle ------------------------------------------------

        public void StartNewGame()
        {
            StartNewGame((int)System.DateTime.Now.Ticks);
        }

        public void StartNewGame(int seed)
        {
            DisposeSession();

            _session = new GameSession(seed, _settings, _audio, _network);
            _session.Particles.LoadContent(GraphicsDevice, _particleTexture);
            _session.PlacePlayerAtSpawn(true);

            _screens.Reset(new HudScreen(_session));
        }

        public void LoadSavedGame()
        {
            int seed;
            if (!_save.PeekSeed(out seed))
            {
                _screens.Push(new MessageScreen("NO SAVE", "There is no saved world to continue.", true));
                return;
            }

            DisposeSession();
            _session = new GameSession(seed, _settings, _audio, _network);
            _session.Particles.LoadContent(GraphicsDevice, _particleTexture);

            if (!_save.Load(_session))
            {
                DisposeSession();
                _screens.Push(new MessageScreen("LOAD FAILED",
                    _save.LastError != null ? _save.LastError : "The save file could not be read.", true));
                return;
            }

            // Terrain around the loaded position has to exist before the player is dropped
            // into it, or they fall through the world while it streams.
            _session.World.UpdateStreaming(_session.Player.Position);
            _screens.Reset(new HudScreen(_session));
        }

        public void SaveGame()
        {
            if (_session == null) return;

            if (!_save.IsReady)
            {
                _save.RequestStorageDevice();
                return;
            }

            if (_save.Save(_session)) _hasSaveFile = true;
        }

        public void ReturnToMainMenu()
        {
            DisposeSession();
            _screens.Reset(new MainMenuScreen());
        }

        public void HostCoopSession()
        {
            if (_session == null) return;
            _network.HostSession(_session.World.Seed);
        }

        public void RequestExit()
        {
#if XBOX360
            // Console titles return to their own menu rather than closing.
            ReturnToMainMenu();
#else
            Exit();
#endif
        }

        public void ApplySettings()
        {
            _input.LookSensitivity = _settings.LookSensitivity;
            _input.InvertY = _settings.InvertY;
            _audio.MasterVolume = _settings.MasterVolume;
            if (_session != null) _session.World.ViewRadius = _settings.ViewRadius;
        }

        private void DisposeSession()
        {
            if (_session == null) return;
            _network.LeaveSession();
            _session.Shutdown();
            _session = null;
        }

        // ---- Frame loop -------------------------------------------------------

        protected override void Update(GameTime gameTime)
        {
            float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;
            if (dt > 0.25f) dt = 0.25f;

            _animationTime += dt;
            UpdateFpsCounter(dt);

            _save.Update();
            if (_save.IsReady && !_saveStateChecked)
            {
                // Deferred until the storage device is actually available. On Xbox that is
                // several frames after startup, because the selector runs through the guide.
                _saveStateChecked = true;
                RefreshSaveState();
            }
            _screens.UpdateSafeArea();

            _input.Update(dt, IsActive);
            CheckControllerDisconnect();

            bool captureLook = _screens.CapturesLook && IsActive;
            _command = _input.BuildCommand(dt, captureLook);

#if !XBOX360
            if (captureLook)
            {
                _input.CentreMouse(GraphicsDevice.Viewport.Width, GraphicsDevice.Viewport.Height);
                IsMouseVisible = false;
            }
            else
            {
                IsMouseVisible = true;
            }
#endif

            if (_session != null)
            {
                // Capture mode fast-forwards the simulation so terrain and lighting have
                // settled before the shot is taken.
                if (CaptureTime >= 0.0f)
                {
                    _session.World.TimeOfDay = CaptureTime;
                    CaptureTime = -1.0f;
                }

                if (WarmUpSeconds > 0.0f)
                {
                    float step = 1.0f / 30.0f;
                    while (WarmUpSeconds > 0.0f)
                    {
                        _session.Update(step, _command, false);
                        UploadFinishedGeometry();
                        WarmUpSeconds -= step;
                    }
                    WarmUpSeconds = 0.0f;
                }

                _session.Update(dt, _command, _screens.GamePaused);
                UploadFinishedGeometry();
                UpdateCamera();
                _audio.SetListener(_camera.Position, _camera.Right);
            }

            _screens.Update(dt, _input);

            base.Update(gameTime);
        }

        /// <summary>
        /// Moves finished chunk geometry onto the GPU.
        ///
        /// This has to happen here rather than inside the session, because it is the only
        /// step of the chunk pipeline that touches the graphics device and therefore the
        /// only one that must run on the thread that owns it.
        /// </summary>
        private void UploadFinishedGeometry()
        {
            if (_session == null) return;
            _session.World.Worker.UploadFinishedMeshes(GraphicsDevice, World.ChunkWorker.MeshJobsPerFrame);
        }

        private void UpdateFpsCounter(float dt)
        {
            _fpsAccumulator += dt;
            _fpsFrames++;
            if (_fpsAccumulator >= 0.5f)
            {
                FramesPerSecond = _fpsFrames / _fpsAccumulator;
                _fpsAccumulator = 0.0f;
                _fpsFrames = 0;
            }
        }

        /// <summary>
        /// The console requires that unplugging the active pad pauses the game and says so.
        /// The dialog dismisses itself when the pad comes back, and cannot be closed while
        /// it is still gone.
        /// </summary>
        private void CheckControllerDisconnect()
        {
            if (_session == null) return;

            if (_input.ControllerDisconnected && !_disconnectDialogOpen)
            {
                _disconnectDialogOpen = true;
                MessageScreen dialog = new MessageScreen("CONTROLLER DISCONNECTED",
                    "Please reconnect the controller to continue.", false);
                dialog.StayOpenWhile = IsControllerStillDisconnected;
                _screens.Push(dialog);
            }
            else if (!_input.ControllerDisconnected)
            {
                _disconnectDialogOpen = false;
            }
        }

        private bool IsControllerStillDisconnected()
        {
            return _input.ControllerDisconnected;
        }

        private void UpdateCamera()
        {
            Entities.LocalPlayer player = _session.Player;

            // In capture mode the player is aimed as well as the camera, so the block
            // cursor agrees with what the shot shows.
            if (HasCapturePitch) player.Pitch = CapturePitch;

            _camera.Position = player.EyePosition;
            _camera.Yaw = player.Yaw;
            _camera.Pitch = player.Pitch - player.RecoilPitch;

            Viewport viewport = GraphicsDevice.Viewport;
            float aspect = viewport.Height > 0 ? viewport.Width / (float)viewport.Height : 1.6f;

            // Far plane just past the streaming edge; anything beyond it is fogged out.
            float far = (_session.World.ViewRadius + 2) * Constants.ChunkSize;
            if (far < 96.0f) far = 96.0f;

            _camera.SetPerspective(aspect, far);
            _camera.Update();
        }

        protected override void Draw(GameTime gameTime)
        {
            float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;

            if (_session != null)
            {
                _sky.Update(_session.World.TimeOfDay);
                Color fog = FogColourFor(_session);

                GraphicsDevice.Clear(fog);
                _sky.Draw(_camera, _session.World.TimeOfDay);

                _worldRenderer.Draw(_session.World, _camera, fog, _session.Player.FlashlightOn, _animationTime);
                _entityRenderer.Draw(_session, _camera);
                _session.Particles.Draw(GraphicsDevice, _camera.View, _camera.Projection, _camera.Right, _camera.Up);
                _entityRenderer.DrawHeldItem(_session, _camera);
            }
            else
            {
                GraphicsDevice.Clear(new Color(12, 14, 20));
            }

            _screens.Batch.Begin(SpriteSortMode.Deferred, BlendState.AlphaBlend,
                SamplerState.PointClamp, DepthStencilState.None, RasterizerState.CullCounterClockwise);
            _screens.Draw(dt);
            _screens.Batch.End();

            base.Draw(gameTime);

            _frameCounter++;
            if (ScreenshotPath != null && _frameCounter >= ScreenshotFrame) CaptureAndExit();
        }

        /// <summary>
        /// Fog matches the sky at the horizon, except underground and in the hell zone,
        /// where it goes dark or red so the change of place is visible before anything
        /// hostile is.
        /// </summary>
        private Color FogColourFor(GameSession session)
        {
            Color horizon = _sky.HorizonColour;

            float eyeY = session.Player.Position.Y;
            if (eyeY < Constants.SeaLevel - 8)
            {
                float depth = MathHelper.Clamp((Constants.SeaLevel - 8 - eyeY) / 30.0f, 0.0f, 1.0f);
                horizon = Color.Lerp(horizon, new Color(8, 8, 12), depth);
            }

            if (session.Player.Tier >= World.DangerTier.Hell)
            {
                horizon = Color.Lerp(horizon, new Color(96, 26, 18), 0.55f);
            }

            if (session.Player.HeadInLiquid)
            {
                byte feet = session.Player.BlockAtFeet(session.World);
                horizon = feet == World.Block.Lava
                    ? new Color(140, 40, 10)
                    : Color.Lerp(horizon, new Color(24, 60, 110), 0.8f);
            }

            return horizon;
        }

        /// <summary>
        /// Writes the procedurally generated art to disk as PNGs.
        ///
        /// The generators are the single source of truth for the game's art, so this is how
        /// the one asset that has to exist as a file -- the Xbox title thumbnail -- gets
        /// produced, and how the atlases can be inspected by eye.
        /// </summary>
        private void DumpGeneratedAssets()
        {
            System.IO.Directory.CreateDirectory(DumpAssetsPath);

            SavePng(_blockAtlas, "blocks.png");
            SavePng(_itemAtlas, "items.png");
            SavePng(_particleTexture, "particle.png");
            SavePng(_font.Texture, "font.png");

            using (Texture2D thumbnail = TextureFactory.CreateThumbnail(GraphicsDevice))
            {
                SavePng(thumbnail, "GameThumbnail.png");
            }

            System.Console.WriteLine("assets written to " + DumpAssetsPath);
            Exit();
        }

        private void SavePng(Texture2D texture, string name)
        {
            if (texture == null) return;
            string path = System.IO.Path.Combine(DumpAssetsPath, name);
            using (System.IO.Stream stream = System.IO.File.Create(path))
            {
                texture.SaveAsPng(stream, texture.Width, texture.Height);
            }
        }

        /// <summary>Writes the back buffer to a PNG and quits. Capture mode only.</summary>
        private void CaptureAndExit()
        {
            int width = GraphicsDevice.PresentationParameters.BackBufferWidth;
            int height = GraphicsDevice.PresentationParameters.BackBufferHeight;

            Color[] pixels = new Color[width * height];
            GraphicsDevice.GetBackBufferData(pixels);

            using (Texture2D shot = new Texture2D(GraphicsDevice, width, height))
            {
                shot.SetData(pixels);
                using (System.IO.Stream stream = System.IO.File.Create(ScreenshotPath))
                {
                    shot.SaveAsPng(stream, width, height);
                }
            }

            if (_session != null)
            {
                Entities.LocalPlayer player = _session.Player;
                System.Console.WriteLine("player " + player.Position
                    + "  surface " + _session.World.SurfaceHeight((int)player.Position.X, (int)player.Position.Z)
                    + "  sky " + _session.World.GetSkyLight((int)player.Position.X, (int)player.Position.Y, (int)player.Position.Z)
                    + "  sun " + _session.World.SunIntensity.ToString("0.00"));
                System.Console.WriteLine("columns " + _session.World.LoadedColumnCount
                    + "  sections drawn " + _worldRenderer.DrawnSections
                    + "  triangles " + _worldRenderer.DrawnTriangles
                    + "  meshed " + _session.World.Worker.SectionsMeshed);
            }
            System.Console.WriteLine("screenshot written to " + ScreenshotPath);
            ScreenshotPath = null;
            Exit();
        }

        protected override void OnExiting(object sender, System.EventArgs args)
        {
            DisposeSession();
            base.OnExiting(sender, args);
        }

        protected override void UnloadContent()
        {
            _worldRenderer.Dispose();
            if (_pixel != null) _pixel.Dispose();
            if (_font != null) _font.Dispose();
            base.UnloadContent();
        }

        /// <summary>Checked once at startup so the title screen can enable CONTINUE.</summary>
        public void RefreshSaveState()
        {
            _hasSaveFile = _save.SaveExists();
        }
    }
}
