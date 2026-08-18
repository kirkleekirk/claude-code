using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Content;
using Microsoft.Xna.Framework.Graphics;
#if XBOX360
using Microsoft.Xna.Framework.GamerServices;
#endif
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

        private PlayerCommand _command;
        private float _animationTime;
        private bool _hasSaveFile;
        private bool _saveStateChecked;
        private bool _disconnectDialogOpen;

        private float _fpsAccumulator;
        private int _fpsFrames;

        public float FramesPerSecond { get; private set; }

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

            _blockAtlas = LoadTexture("Textures/blocks");
            _itemAtlas = LoadTexture("Textures/items");
            _particleTexture = LoadTexture("Textures/particle");
            _screens.BlockAtlas = _blockAtlas;
            _screens.ItemAtlas = _itemAtlas;

            _screens.Font = LoadFont("Fonts/Hud");
            _screens.TitleFont = LoadFont("Fonts/Title");

            _voxelEffect = Content.Load<Effect>("Shaders/Voxel");

            _audio.LoadContent(Content);
            _sky.LoadContent(GraphicsDevice);
            _worldRenderer.LoadContent(GraphicsDevice, _voxelEffect, _blockAtlas);
            _entityRenderer.LoadContent(GraphicsDevice, _blockAtlas, _itemAtlas);

            _screens.UpdateSafeArea();
            ApplySettings();

            _screens.Reset(new MainMenuScreen());
        }

        private Texture2D LoadTexture(string name)
        {
            try
            {
                return Content.Load<Texture2D>(name);
            }
            catch (ContentLoadException)
            {
                // Missing art should not be fatal -- a magenta placeholder makes it obvious
                // which asset failed to build without taking the whole game down.
                Texture2D placeholder = new Texture2D(GraphicsDevice, 16, 16);
                Color[] pixels = new Color[16 * 16];
                for (int i = 0; i < pixels.Length; i++) pixels[i] = new Color(255, 0, 255);
                placeholder.SetData(pixels);
                return placeholder;
            }
        }

        private SpriteFont LoadFont(string name)
        {
            try
            {
                return Content.Load<SpriteFont>(name);
            }
            catch (ContentLoadException)
            {
                return null;
            }
        }

        // ---- Session lifecycle ------------------------------------------------

        public void StartNewGame()
        {
            DisposeSession();

            int seed = (int)System.DateTime.Now.Ticks;
            _session = new GameSession(seed, _settings, _audio, _network);
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
                _session.Update(dt, _command, _screens.GamePaused);
                UpdateCamera();
                _audio.SetListener(_camera.Position, _camera.Right);
            }

            _screens.Update(dt, _input);

            base.Update(gameTime);
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

        protected override void OnExiting(object sender, System.EventArgs args)
        {
            DisposeSession();
            base.OnExiting(sender, args);
        }

        protected override void UnloadContent()
        {
            _worldRenderer.Dispose();
            if (_pixel != null) _pixel.Dispose();
            base.UnloadContent();
        }

        /// <summary>Checked once at startup so the title screen can enable CONTINUE.</summary>
        public void RefreshSaveState()
        {
            _hasSaveFile = _save.SaveExists();
        }
    }
}
