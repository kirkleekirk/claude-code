using CastleMinerZ.World;

namespace CastleMinerZ.Items
{
    /// <summary>
    /// One inventory slot. A struct so the whole inventory is a single flat array with no
    /// per-slot allocation -- inventories get serialised, networked and copied every frame
    /// by the HUD, and none of that should produce garbage.
    /// </summary>
    public struct ItemStack
    {
        public byte Id;
        public byte Count;

        /// <summary>Per-stack state. For firearms this is the rounds currently in the magazine.</summary>
        public ushort Data;

        public ItemStack(byte id, int count)
        {
            Id = id;
            Count = (byte)count;
            Data = 0;
        }

        public ItemStack(byte id, int count, int data)
        {
            Id = id;
            Count = (byte)count;
            Data = (ushort)data;
        }

        public bool IsEmpty
        {
            get { return Id == Item.None || Count == 0; }
        }

        public static ItemStack Empty
        {
            get { return new ItemStack(Item.None, 0); }
        }

        public ItemDefinition Definition
        {
            get { return ItemRegistry.Get(Id); }
        }

        /// <summary>Two stacks merge only if they are the same item and carry no per-stack state.</summary>
        public bool CanStackWith(ItemStack other)
        {
            return Id == other.Id && Data == 0 && other.Data == 0 && ItemRegistry.Get(Id).MaxStack > 1;
        }
    }

    /// <summary>
    /// The player's carried items: a hotbar the face buttons cycle through, plus a backpack.
    /// </summary>
    public sealed class Inventory
    {
        public const int HotbarSlots = 8;
        public const int BackpackSlots = 24;
        public const int TotalSlots = HotbarSlots + BackpackSlots;

        private readonly ItemStack[] _slots = new ItemStack[TotalSlots];
        private int _selected;

        public ItemStack[] Slots
        {
            get { return _slots; }
        }

        public int SelectedIndex
        {
            get { return _selected; }
            set
            {
                _selected = value % HotbarSlots;
                if (_selected < 0) _selected += HotbarSlots;
            }
        }

        public ItemStack Selected
        {
            get { return _slots[_selected]; }
            set { _slots[_selected] = value; }
        }

        public void CycleSelection(int direction)
        {
            SelectedIndex = _selected + direction;
        }

        public ItemStack this[int index]
        {
            get { return _slots[index]; }
            set { _slots[index] = value; }
        }

        public void Clear()
        {
            for (int i = 0; i < _slots.Length; i++) _slots[i] = ItemStack.Empty;
            _selected = 0;
        }

        /// <summary>
        /// Adds items, topping up existing stacks before taking an empty slot.
        /// Returns however many did not fit.
        /// </summary>
        public int Add(byte id, int count)
        {
            if (id == Item.None || count <= 0) return 0;
            int maxStack = ItemRegistry.Get(id).MaxStack;

            if (maxStack > 1)
            {
                for (int i = 0; i < _slots.Length && count > 0; i++)
                {
                    if (_slots[i].Id != id || _slots[i].Data != 0) continue;
                    int space = maxStack - _slots[i].Count;
                    if (space <= 0) continue;

                    int moved = count < space ? count : space;
                    _slots[i].Count = (byte)(_slots[i].Count + moved);
                    count -= moved;
                }
            }

            for (int i = 0; i < _slots.Length && count > 0; i++)
            {
                if (!_slots[i].IsEmpty) continue;
                int moved = count < maxStack ? count : maxStack;
                _slots[i] = new ItemStack(id, moved);
                count -= moved;
            }

            return count;
        }

        public int CountOf(byte id)
        {
            int total = 0;
            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].Id == id) total += _slots[i].Count;
            }
            return total;
        }

        public bool Has(byte id, int count)
        {
            return CountOf(id) >= count;
        }

        /// <summary>Consumes up to <paramref name="count"/> items and returns how many were actually removed.</summary>
        public int Remove(byte id, int count)
        {
            int removed = 0;
            for (int i = 0; i < _slots.Length && removed < count; i++)
            {
                if (_slots[i].Id != id) continue;
                int take = count - removed;
                if (take > _slots[i].Count) take = _slots[i].Count;

                _slots[i].Count = (byte)(_slots[i].Count - take);
                removed += take;
                if (_slots[i].Count == 0) _slots[i] = ItemStack.Empty;
            }
            return removed;
        }

        /// <summary>Consumes one of the selected stack. Used when a block is placed.</summary>
        public void ConsumeSelected(int count)
        {
            if (_slots[_selected].IsEmpty) return;
            if (_slots[_selected].Count <= count) _slots[_selected] = ItemStack.Empty;
            else _slots[_selected].Count = (byte)(_slots[_selected].Count - count);
        }

        public void Swap(int a, int b)
        {
            ItemStack tmp = _slots[a];
            _slots[a] = _slots[b];
            _slots[b] = tmp;
        }

        public bool IsFull
        {
            get
            {
                for (int i = 0; i < _slots.Length; i++)
                {
                    if (_slots[i].IsEmpty) return false;
                }
                return true;
            }
        }

        /// <summary>Starting kit: enough to dig in, and nothing that skips the progression.</summary>
        public void GiveStartingGear()
        {
            Clear();
            _slots[0] = new ItemStack(Item.StonePickaxe, 1);
            _slots[1] = new ItemStack(Item.StoneSword, 1);
            _slots[2] = new ItemStack(Block.Torch, 16);
            _slots[3] = new ItemStack(Block.Planks, 32);
        }
    }
}
