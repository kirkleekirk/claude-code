using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Input;

namespace CastleMinerZ.Core
{
    /// <summary>
    /// Device-independent intent for one frame. Gameplay code reads this and never touches
    /// GamePad or Keyboard directly, which is what lets the same player update run from a
    /// local pad, from a keyboard, or from a network packet.
    /// </summary>
    public struct PlayerCommand
    {
        /// <summary>X = strafe, Y = forward. Already dead-zoned and clamped to the unit disc.</summary>
        public Vector2 Move;

        /// <summary>Yaw/pitch rate this frame, in radians.</summary>
        public Vector2 Look;

        public bool Jump;
        public bool JumpPressed;
        public bool Sprint;
        public bool Crouch;

        public bool Attack;
        public bool AttackPressed;
        public bool Use;
        public bool UsePressed;

        public bool ReloadPressed;
        public bool FlashlightPressed;

        /// <summary>-1 or +1 when the hotbar selection should move.</summary>
        public int HotbarDelta;

        /// <summary>Absolute hotbar slot, or -1. Only the keyboard produces this.</summary>
        public int HotbarSlot;

        public bool InventoryPressed;
        public bool CraftPressed;
        public bool PausePressed;
    }

    /// <summary>
    /// Polls the input devices once per frame and turns them into a
    /// <see cref="PlayerCommand"/>.
    ///
    /// The controller-disconnect handling is not optional decoration: an Xbox 360 title has
    /// to pause and display a message when the active pad is unplugged mid-game, and it has
    /// to resume with the same pad. <see cref="ControllerDisconnected"/> drives that.
    /// </summary>
    public sealed class InputManager
    {
        private GamePadState _pad;
        private GamePadState _lastPad;

#if !XBOX360
        private KeyboardState _keys;
        private KeyboardState _lastKeys;
        private MouseState _mouse;
        private MouseState _lastMouse;
        private bool _mouseLookActive;
        private bool _mouseCentred;
        private int _centreX;
        private int _centreY;
#endif

        private PlayerIndex _playerIndex = PlayerIndex.One;
        private bool _wasEverConnected;

        /// <summary>Radians of yaw per second at full stick deflection.</summary>
        public float LookSensitivity = 3.4f;
        public float MouseSensitivity = 0.0032f;
        public bool InvertY;

        public PlayerIndex ActivePlayer
        {
            get { return _playerIndex; }
            set { _playerIndex = value; }
        }

        public GamePadState Pad
        {
            get { return _pad; }
        }

        /// <summary>True once a pad has been seen and is currently unplugged.</summary>
        public bool ControllerDisconnected
        {
            get { return _wasEverConnected && !_pad.IsConnected; }
        }

        public void Update(float dt, bool gameHasFocus)
        {
            _lastPad = _pad;
            _pad = GamePad.GetState(_playerIndex, GamePadDeadZone.Circular);
            if (_pad.IsConnected) _wasEverConnected = true;

#if !XBOX360
            _lastKeys = _keys;
            _keys = Keyboard.GetState();
            _lastMouse = _mouse;
            _mouse = Mouse.GetState();
            _mouseLookActive = gameHasFocus;
            if (!gameHasFocus) _mouseCentred = false;
#endif
        }

        /// <summary>
        /// On Windows the pad and the keyboard are both live; whichever the player touches
        /// wins for that frame, so a controller can be picked up mid-session.
        /// </summary>
        public PlayerCommand BuildCommand(float dt, bool allowMouseLook)
        {
            PlayerCommand c = new PlayerCommand();
            c.HotbarSlot = -1;

            // ---- Gamepad ----
            if (_pad.IsConnected)
            {
                Vector2 move = _pad.ThumbSticks.Left;
                c.Move = move;

                Vector2 look = _pad.ThumbSticks.Right;
                float magnitude = look.Length();
                if (magnitude > 0.0f)
                {
                    // Response curve: multiplying by the stick magnitude again makes the
                    // turn rate quadratic, so small corrections stay precise while the edge
                    // of the stick still gives the full turn speed.
                    float rate = LookSensitivity * dt * magnitude;
                    c.Look = new Vector2(look.X * rate, (InvertY ? look.Y : -look.Y) * rate);
                }

                c.Jump = _pad.Buttons.A == ButtonState.Pressed;
                c.JumpPressed = Pressed(Buttons.A);
                c.Sprint = _pad.Buttons.LeftStick == ButtonState.Pressed;
                c.Crouch = _pad.Buttons.B == ButtonState.Pressed;

                c.Attack = _pad.Triggers.Right > 0.35f;
                c.AttackPressed = _pad.Triggers.Right > 0.35f && _lastPad.Triggers.Right <= 0.35f;
                c.Use = _pad.Triggers.Left > 0.35f;
                c.UsePressed = _pad.Triggers.Left > 0.35f && _lastPad.Triggers.Left <= 0.35f;

                c.ReloadPressed = Pressed(Buttons.X);
                c.FlashlightPressed = Pressed(Buttons.RightStick);

                if (Pressed(Buttons.RightShoulder)) c.HotbarDelta = 1;
                else if (Pressed(Buttons.LeftShoulder)) c.HotbarDelta = -1;

                c.InventoryPressed = Pressed(Buttons.Y);
                c.CraftPressed = Pressed(Buttons.Back);
                c.PausePressed = Pressed(Buttons.Start);
            }

#if !XBOX360
            // ---- Keyboard and mouse ----
            Vector2 kbMove = Vector2.Zero;
            if (_keys.IsKeyDown(Keys.W)) kbMove.Y += 1.0f;
            if (_keys.IsKeyDown(Keys.S)) kbMove.Y -= 1.0f;
            if (_keys.IsKeyDown(Keys.D)) kbMove.X += 1.0f;
            if (_keys.IsKeyDown(Keys.A)) kbMove.X -= 1.0f;
            if (kbMove != Vector2.Zero)
            {
                kbMove.Normalize();
                c.Move = kbMove;
            }

            if (allowMouseLook && _mouseLookActive && _mouseCentred)
            {
                int dx = _mouse.X - _centreX;
                int dy = _mouse.Y - _centreY;
                if (dx != 0 || dy != 0)
                {
                    c.Look += new Vector2(dx * MouseSensitivity, (InvertY ? dy : -dy) * MouseSensitivity);
                }
            }

            if (_keys.IsKeyDown(Keys.Space)) c.Jump = true;
            if (KeyPressed(Keys.Space)) c.JumpPressed = true;
            if (_keys.IsKeyDown(Keys.LeftShift)) c.Sprint = true;
            if (_keys.IsKeyDown(Keys.LeftControl)) c.Crouch = true;

            if (_mouse.LeftButton == ButtonState.Pressed) c.Attack = true;
            if (_mouse.LeftButton == ButtonState.Pressed && _lastMouse.LeftButton == ButtonState.Released) c.AttackPressed = true;
            if (_mouse.RightButton == ButtonState.Pressed) c.Use = true;
            if (_mouse.RightButton == ButtonState.Pressed && _lastMouse.RightButton == ButtonState.Released) c.UsePressed = true;

            if (KeyPressed(Keys.R)) c.ReloadPressed = true;
            if (KeyPressed(Keys.F)) c.FlashlightPressed = true;
            if (KeyPressed(Keys.Tab) || KeyPressed(Keys.I)) c.InventoryPressed = true;
            if (KeyPressed(Keys.C)) c.CraftPressed = true;
            if (KeyPressed(Keys.Escape)) c.PausePressed = true;

            int wheel = _mouse.ScrollWheelValue - _lastMouse.ScrollWheelValue;
            if (wheel > 0) c.HotbarDelta = -1;
            else if (wheel < 0) c.HotbarDelta = 1;

            for (int i = 0; i < 8; i++)
            {
                if (KeyPressed(Keys.D1 + i)) c.HotbarSlot = i;
            }
#endif
            return c;
        }

        public bool Pressed(Buttons button)
        {
            return _pad.IsButtonDown(button) && _lastPad.IsButtonUp(button);
        }

        public bool Down(Buttons button)
        {
            return _pad.IsButtonDown(button);
        }

        /// <summary>Menu navigation: the stick counts as a d-pad, with a repeat delay.</summary>
        public int MenuVertical()
        {
            if (Pressed(Buttons.DPadUp) || Pressed(Buttons.LeftThumbstickUp)) return -1;
            if (Pressed(Buttons.DPadDown) || Pressed(Buttons.LeftThumbstickDown)) return 1;
#if !XBOX360
            if (KeyPressed(Keys.Up) || KeyPressed(Keys.W)) return -1;
            if (KeyPressed(Keys.Down) || KeyPressed(Keys.S)) return 1;
#endif
            return 0;
        }

        public int MenuHorizontal()
        {
            if (Pressed(Buttons.DPadLeft) || Pressed(Buttons.LeftThumbstickLeft)) return -1;
            if (Pressed(Buttons.DPadRight) || Pressed(Buttons.LeftThumbstickRight)) return 1;
#if !XBOX360
            if (KeyPressed(Keys.Left) || KeyPressed(Keys.A)) return -1;
            if (KeyPressed(Keys.Right) || KeyPressed(Keys.D)) return 1;
#endif
            return 0;
        }

        public bool MenuAccept()
        {
            if (Pressed(Buttons.A) || Pressed(Buttons.Start)) return true;
#if !XBOX360
            if (KeyPressed(Keys.Enter) || KeyPressed(Keys.Space)) return true;
#endif
            return false;
        }

        public bool MenuCancel()
        {
            if (Pressed(Buttons.B)) return true;
#if !XBOX360
            if (KeyPressed(Keys.Escape) || KeyPressed(Keys.Back)) return true;
#endif
            return false;
        }

        /// <summary>Any button on any pad -- the "press START" gate on the title screen.</summary>
        public bool AnyPadStart(out PlayerIndex which)
        {
            for (int i = 0; i < 4; i++)
            {
                PlayerIndex index = (PlayerIndex)i;
                GamePadState state = GamePad.GetState(index);
                if (state.IsConnected && (state.Buttons.Start == ButtonState.Pressed || state.Buttons.A == ButtonState.Pressed))
                {
                    which = index;
                    return true;
                }
            }
            which = PlayerIndex.One;
            return false;
        }

#if !XBOX360
        public bool KeyPressed(Keys key)
        {
            return _keys.IsKeyDown(key) && _lastKeys.IsKeyUp(key);
        }

        /// <summary>Re-centres the pointer so relative mouse look does not run off the window.</summary>
        public void CentreMouse(int width, int height)
        {
            _centreX = width / 2;
            _centreY = height / 2;
            Mouse.SetPosition(_centreX, _centreY);
            _mouse = Mouse.GetState();
            _lastMouse = _mouse;
            // Until the pointer has been parked once, the delta against a centre of (0,0)
            // would be the size of half the window, which reads as a violent flick.
            _mouseCentred = true;
        }
#endif
    }
}
