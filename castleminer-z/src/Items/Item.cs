using CastleMinerZ.World;

namespace CastleMinerZ.Items
{
    /// <summary>
    /// Item ids. Ids 1-26 deliberately match block ids one for one, so any block can be
    /// carried and placed without a translation table; everything that is not a block
    /// starts at 64.
    /// </summary>
    public static class Item
    {
        public const byte None = 0;

        // 1..26 are blocks -- see CastleMinerZ.World.Block.

        // Materials
        public const byte Stick = 64;
        public const byte Coal = 65;
        public const byte IronIngot = 66;
        public const byte GoldIngot = 67;
        public const byte Diamond = 68;
        public const byte DragonStone = 69;
        public const byte Gunpowder = 70;
        public const byte Casing = 71;

        // Tools
        public const byte StonePickaxe = 80;
        public const byte IronPickaxe = 81;
        public const byte DiamondPickaxe = 82;
        public const byte DragonPickaxe = 83;
        public const byte StoneAxe = 84;
        public const byte IronAxe = 85;
        public const byte DiamondAxe = 86;
        public const byte DragonAxe = 87;
        public const byte StoneShovel = 88;
        public const byte IronShovel = 89;
        public const byte DiamondShovel = 90;
        public const byte DragonShovel = 91;
        public const byte StoneSword = 92;
        public const byte IronSword = 93;
        public const byte DiamondSword = 94;
        public const byte DragonSword = 95;

        // Firearms
        public const byte Pistol = 100;
        public const byte Shotgun = 101;
        public const byte AssaultRifle = 102;
        public const byte SniperRifle = 103;
        public const byte RocketLauncher = 104;
        public const byte LaserRifle = 105;

        // Ammunition
        public const byte PistolAmmo = 110;
        public const byte ShotgunShells = 111;
        public const byte RifleAmmo = 112;
        public const byte SniperAmmo = 113;
        public const byte Rocket = 114;
        public const byte LaserCell = 115;

        public static bool IsBlock(byte id)
        {
            return id > 0 && id < Block.Count;
        }
    }

    /// <summary>How a weapon behaves when the trigger is held.</summary>
    public enum GunKind
    {
        None = 0,
        /// <summary>One shot per pull.</summary>
        SemiAuto = 1,
        /// <summary>Fires continuously.</summary>
        FullAuto = 2,
        /// <summary>Multiple pellets, wide spread, one pull.</summary>
        Shotgun = 3,
        /// <summary>Launches a travelling explosive projectile.</summary>
        Launcher = 4,
        /// <summary>Hitscan beam, pierces, no bullet drop.</summary>
        Beam = 5
    }

    /// <summary>Static description of one item type.</summary>
    public sealed class ItemDefinition
    {
        public byte Id;
        public string Name;
        public int MaxStack;

        /// <summary>Block placed when used, or <see cref="World.Block.Air"/> for non-placeables.</summary>
        public byte PlacesBlock;

        /// <summary>Index into the item icon atlas. Blocks instead draw their own top texture.</summary>
        public int IconTile;

        // Tool behaviour
        public ToolClass Tool;
        public int Tier;

        /// <summary>Multiplies mining speed when the tool matches the block's tool class.</summary>
        public float MiningMultiplier;

        // Melee
        public int MeleeDamage;
        public float AttackInterval;

        // Firearm
        public GunKind Gun;
        public byte AmmoItem;
        public int MagazineSize;
        public float FireInterval;
        public int GunDamage;
        public float GunRange;
        public int Pellets;
        public float Spread;
        public float RecoilKick;
        public float ReloadTime;

        public ItemDefinition(byte id, string name)
        {
            Id = id;
            Name = name;
            MaxStack = 99;
            MiningMultiplier = 1.0f;
            MeleeDamage = 1;
            AttackInterval = 0.35f;
            Pellets = 1;
        }

        public bool IsPlaceable
        {
            get { return PlacesBlock != World.Block.Air; }
        }

        public bool IsFirearm
        {
            get { return Gun != GunKind.None; }
        }
    }
}
