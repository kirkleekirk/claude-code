using Microsoft.Xna.Framework;
using CastleMinerZ.Items;

namespace CastleMinerZ.Entities
{
    /// <summary>A dropped item spinning on the ground, waiting to be walked over.</summary>
    public struct ItemDrop
    {
        public bool Alive;
        public byte ItemId;
        public byte Count;
        public Vector3 Position;
        public Vector3 Velocity;

        /// <summary>Seconds left before it disappears.</summary>
        public float Life;

        /// <summary>Short delay before pickup, so a mined block does not snap back instantly.</summary>
        public float PickupDelay;

        public float Spin;
    }

    /// <summary>
    /// Dropped items.
    ///
    /// Capacity is fixed and small: on a console the alternative is an unbounded list that a
    /// player with a rocket launcher can turn into a frame-rate problem. When it is full the
    /// oldest drop is recycled.
    /// </summary>
    public sealed class ItemDropManager
    {
        private const int Capacity = 128;
        private const float PickupRadius = 1.6f;
        private const float LifeSeconds = 180.0f;

        private readonly ItemDrop[] _items = new ItemDrop[Capacity];
        private int _next;

        public ItemDrop[] Items
        {
            get { return _items; }
        }

        public void Spawn(Vector3 position, byte itemId, int count)
        {
            if (itemId == Item.None || count <= 0) return;

            int slot = -1;
            for (int i = 0; i < Capacity; i++)
            {
                int index = (_next + i) % Capacity;
                if (!_items[index].Alive) { slot = index; break; }
            }
            if (slot < 0) slot = _next;
            _next = (slot + 1) % Capacity;

            _items[slot].Alive = true;
            _items[slot].ItemId = itemId;
            _items[slot].Count = (byte)count;
            _items[slot].Position = position;
            _items[slot].Velocity = new Vector3(0.0f, 2.0f, 0.0f);
            _items[slot].Life = LifeSeconds;
            _items[slot].PickupDelay = 0.35f;
            _items[slot].Spin = 0.0f;
        }

        public void Update(GameSession session, float dt)
        {
            LocalPlayer player = session.Player;
            Vector3 playerCentre = player.Position + new Vector3(0.0f, player.Height * 0.4f, 0.0f);

            for (int i = 0; i < Capacity; i++)
            {
                if (!_items[i].Alive) continue;

                _items[i].Life -= dt;
                if (_items[i].Life <= 0.0f)
                {
                    _items[i].Alive = false;
                    continue;
                }

                if (_items[i].PickupDelay > 0.0f) _items[i].PickupDelay -= dt;
                _items[i].Spin += dt * 2.2f;

                // Simple gravity with a floor test; drops do not need swept collision.
                _items[i].Velocity.Y -= Constants.Gravity * 0.55f * dt;
                Vector3 next = _items[i].Position + _items[i].Velocity * dt;

                int bx = (int)System.Math.Floor(next.X);
                int by = (int)System.Math.Floor(next.Y - 0.15f);
                int bz = (int)System.Math.Floor(next.Z);

                if (session.World.IsSolid(bx, by, bz))
                {
                    next.Y = by + 1.15f;
                    _items[i].Velocity = Vector3.Zero;
                }

                _items[i].Position = next;

                if (_items[i].PickupDelay > 0.0f || player.IsDead) continue;

                Vector3 toPlayer = playerCentre - _items[i].Position;
                float distanceSquared = toPlayer.LengthSquared();

                if (distanceSquared < PickupRadius * PickupRadius)
                {
                    int leftover = player.Inventory.Add(_items[i].ItemId, _items[i].Count);
                    if (leftover == 0)
                    {
                        _items[i].Alive = false;
                        session.Audio.Play(SoundId.Pickup, _items[i].Position);
                        session.ShowPickup(_items[i].ItemId, _items[i].Count);
                    }
                    else
                    {
                        _items[i].Count = (byte)leftover;
                    }
                }
                else if (distanceSquared < 9.0f)
                {
                    // Gentle magnet so items come to you instead of needing to be walked onto.
                    toPlayer.Normalize();
                    _items[i].Position += toPlayer * 4.0f * dt;
                }
            }
        }

        public void Clear()
        {
            for (int i = 0; i < Capacity; i++) _items[i].Alive = false;
        }
    }
}
