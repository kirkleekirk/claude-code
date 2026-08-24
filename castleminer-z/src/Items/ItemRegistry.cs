using CastleMinerZ.World;

namespace CastleMinerZ.Items
{
    /// <summary>
    /// The item table. Blocks are registered automatically from
    /// <see cref="BlockRegistry"/>; everything else is spelled out here.
    ///
    /// Weapon tiers are pinned to the ore tiers so that the only way to upgrade is to
    /// travel further from spawn -- a stone sword will not carry you into the hell zone,
    /// and the laser rifle needs dragon stone, which does not generate until 6 km out.
    /// </summary>
    public static class ItemRegistry
    {
        private static readonly ItemDefinition[] Defs = new ItemDefinition[256];
        private static bool _initialised;

        /// <summary>Icon atlas is 16x16 tiles, matching the block atlas layout.</summary>
        public const int IconAtlasTilesPerRow = Assets.TextureFactory.TilesPerRow;

        public static void Initialise()
        {
            if (_initialised) return;
            _initialised = true;

            BlockRegistry.Initialise();

            // Every block is carryable, and placing it puts the same block back.
            for (byte id = 1; id < Block.Count; id++)
            {
                BlockDefinition block = BlockRegistry.Get(id);
                if (block.Hardness < 0.0f && id != Block.Bedrock)
                {
                    // Liquids are not items.
                    continue;
                }
                if (block.IsLiquid) continue;

                ItemDefinition item = new ItemDefinition(id, block.Name);
                item.PlacesBlock = id;
                item.MaxStack = 99;
                item.MeleeDamage = 1;
                Defs[id] = item;
            }

            // ---- Materials ----
            Material(Item.Stick, "Stick", 0);
            Material(Item.Coal, "Coal", 1);
            Material(Item.IronIngot, "Iron Ingot", 2);
            Material(Item.GoldIngot, "Gold Ingot", 3);
            Material(Item.Diamond, "Diamond", 4);
            Material(Item.DragonStone, "Dragon Stone", 5);
            Material(Item.Gunpowder, "Gunpowder", 6);
            Material(Item.Casing, "Casing", 7);

            // ---- Tools ----
            // damage, mining multiplier and tier all move together per material.
            Tool(Item.StonePickaxe, "Stone Pickaxe", ToolClass.Pickaxe, 1, 3.0f, 2, 16);
            Tool(Item.IronPickaxe, "Iron Pickaxe", ToolClass.Pickaxe, 2, 5.5f, 3, 17);
            Tool(Item.DiamondPickaxe, "Diamond Pickaxe", ToolClass.Pickaxe, 3, 9.0f, 4, 18);
            Tool(Item.DragonPickaxe, "Dragon Pickaxe", ToolClass.Pickaxe, 4, 15.0f, 6, 19);

            Tool(Item.StoneAxe, "Stone Axe", ToolClass.Axe, 1, 3.0f, 4, 20);
            Tool(Item.IronAxe, "Iron Axe", ToolClass.Axe, 2, 5.5f, 6, 21);
            Tool(Item.DiamondAxe, "Diamond Axe", ToolClass.Axe, 3, 9.0f, 8, 22);
            Tool(Item.DragonAxe, "Dragon Axe", ToolClass.Axe, 4, 15.0f, 11, 23);

            Tool(Item.StoneShovel, "Stone Shovel", ToolClass.Shovel, 1, 3.0f, 2, 24);
            Tool(Item.IronShovel, "Iron Shovel", ToolClass.Shovel, 2, 5.5f, 3, 25);
            Tool(Item.DiamondShovel, "Diamond Shovel", ToolClass.Shovel, 3, 9.0f, 4, 26);
            Tool(Item.DragonShovel, "Dragon Shovel", ToolClass.Shovel, 4, 15.0f, 5, 27);

            Sword(Item.StoneSword, "Stone Sword", 1, 14, 28);
            Sword(Item.IronSword, "Iron Sword", 2, 22, 29);
            Sword(Item.DiamondSword, "Diamond Sword", 3, 34, 30);
            Sword(Item.DragonSword, "Dragon Sword", 4, 55, 31);

            // ---- Firearms ----
            ItemDefinition pistol = Gun(Item.Pistol, "Pistol", GunKind.SemiAuto, Item.PistolAmmo, 12, 0.24f, 26, 60.0f, 32);
            pistol.Spread = 0.012f;
            pistol.RecoilKick = 0.9f;
            pistol.ReloadTime = 1.1f;

            ItemDefinition shotgun = Gun(Item.Shotgun, "Shotgun", GunKind.Shotgun, Item.ShotgunShells, 6, 0.85f, 15, 22.0f, 33);
            shotgun.Pellets = 8;
            shotgun.Spread = 0.075f;
            shotgun.RecoilKick = 3.2f;
            shotgun.ReloadTime = 2.0f;

            ItemDefinition rifle = Gun(Item.AssaultRifle, "Assault Rifle", GunKind.FullAuto, Item.RifleAmmo, 30, 0.095f, 22, 90.0f, 34);
            rifle.Spread = 0.022f;
            rifle.RecoilKick = 0.7f;
            rifle.ReloadTime = 2.2f;

            ItemDefinition sniper = Gun(Item.SniperRifle, "Sniper Rifle", GunKind.SemiAuto, Item.SniperAmmo, 5, 1.25f, 130, 220.0f, 35);
            sniper.Spread = 0.0f;
            sniper.RecoilKick = 4.5f;
            sniper.ReloadTime = 2.6f;

            ItemDefinition launcher = Gun(Item.RocketLauncher, "Rocket Launcher", GunKind.Launcher, Item.Rocket, 1, 1.6f, 120, 120.0f, 36);
            launcher.RecoilKick = 5.0f;
            launcher.ReloadTime = 2.8f;

            ItemDefinition laser = Gun(Item.LaserRifle, "Laser Rifle", GunKind.Beam, Item.LaserCell, 20, 0.16f, 48, 140.0f, 37);
            laser.Spread = 0.0f;
            laser.RecoilKick = 0.25f;
            laser.ReloadTime = 1.8f;

            // ---- Ammunition ----
            Material(Item.PistolAmmo, "Pistol Rounds", 8);
            Material(Item.ShotgunShells, "Shotgun Shells", 9);
            Material(Item.RifleAmmo, "Rifle Rounds", 10);
            Material(Item.SniperAmmo, "Sniper Rounds", 11);
            Material(Item.Rocket, "Rocket", 12);
            Material(Item.LaserCell, "Laser Cell", 13);

            for (int i = 0; i < Defs.Length; i++)
            {
                if (Defs[i] == null) Defs[i] = new ItemDefinition(0, "");
            }
        }

        private static ItemDefinition Material(byte id, string name, int icon)
        {
            ItemDefinition d = new ItemDefinition(id, name);
            d.IconTile = icon;
            Defs[id] = d;
            return d;
        }

        private static ItemDefinition Tool(byte id, string name, ToolClass tool, int tier, float speed, int damage, int icon)
        {
            ItemDefinition d = new ItemDefinition(id, name);
            d.MaxStack = 1;
            d.Tool = tool;
            d.Tier = tier;
            d.MiningMultiplier = speed;
            d.MeleeDamage = damage;
            d.AttackInterval = 0.42f;
            d.IconTile = icon;
            Defs[id] = d;
            return d;
        }

        private static ItemDefinition Sword(byte id, string name, int tier, int damage, int icon)
        {
            ItemDefinition d = new ItemDefinition(id, name);
            d.MaxStack = 1;
            d.Tier = tier;
            d.MeleeDamage = damage;
            d.AttackInterval = 0.34f;
            d.MiningMultiplier = 1.2f;
            d.IconTile = icon;
            Defs[id] = d;
            return d;
        }

        private static ItemDefinition Gun(byte id, string name, GunKind kind, byte ammo, int magazine,
            float fireInterval, int damage, float range, int icon)
        {
            ItemDefinition d = new ItemDefinition(id, name);
            d.MaxStack = 1;
            d.Gun = kind;
            d.AmmoItem = ammo;
            d.MagazineSize = magazine;
            d.FireInterval = fireInterval;
            d.GunDamage = damage;
            d.GunRange = range;
            d.MeleeDamage = 3;
            d.AttackInterval = fireInterval;
            d.IconTile = icon;
            Defs[id] = d;
            return d;
        }

        public static ItemDefinition Get(byte id)
        {
            return Defs[id];
        }

        public static string NameOf(byte id)
        {
            return Defs[id].Name;
        }

        public static bool Exists(byte id)
        {
            return id != 0 && Defs[id].Id != 0;
        }
    }
}
