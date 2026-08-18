using System.Collections.Generic;
using CastleMinerZ.World;

namespace CastleMinerZ.Items
{
    /// <summary>A crafting recipe: up to four ingredient stacks in, one stack out.</summary>
    public sealed class Recipe
    {
        public byte Result;
        public int ResultCount;

        public byte[] IngredientIds;
        public int[] IngredientCounts;

        /// <summary>Grouping for the crafting menu's category tabs.</summary>
        public RecipeCategory Category;

        public Recipe(byte result, int resultCount, RecipeCategory category)
        {
            Result = result;
            ResultCount = resultCount;
            Category = category;
            IngredientIds = new byte[4];
            IngredientCounts = new int[4];
        }

        public int IngredientCount
        {
            get
            {
                int n = 0;
                for (int i = 0; i < IngredientIds.Length; i++)
                {
                    if (IngredientIds[i] != Item.None) n++;
                }
                return n;
            }
        }

        public bool CanCraft(Inventory inventory)
        {
            for (int i = 0; i < IngredientIds.Length; i++)
            {
                if (IngredientIds[i] == Item.None) continue;
                if (!inventory.Has(IngredientIds[i], IngredientCounts[i])) return false;
            }
            return true;
        }

        /// <summary>Consumes the ingredients and adds the result. Returns false if it did not fit.</summary>
        public bool Craft(Inventory inventory)
        {
            if (!CanCraft(inventory)) return false;
            if (inventory.IsFull && inventory.CountOf(Result) == 0) return false;

            for (int i = 0; i < IngredientIds.Length; i++)
            {
                if (IngredientIds[i] == Item.None) continue;
                inventory.Remove(IngredientIds[i], IngredientCounts[i]);
            }

            int leftover = inventory.Add(Result, ResultCount);
            return leftover < ResultCount;
        }
    }

    public enum RecipeCategory
    {
        Materials = 0,
        Building = 1,
        Tools = 2,
        Weapons = 3,
        Ammunition = 4
    }

    /// <summary>
    /// Every recipe in the game, built once at startup.
    ///
    /// There is no crafting bench and no grid: the whole book is available from the pause
    /// menu wherever you are standing, which is what makes long expeditions away from a
    /// base viable. What gates progression is the ingredients, not the workbench.
    /// </summary>
    public static class RecipeBook
    {
        private static readonly List<Recipe> _all = new List<Recipe>(48);
        private static bool _initialised;

        public static List<Recipe> All
        {
            get { return _all; }
        }

        public static void Initialise()
        {
            if (_initialised) return;
            _initialised = true;

            ItemRegistry.Initialise();

            // ---- Materials and smelting ----
            Add(Block.Planks, 4, RecipeCategory.Materials, Block.Log, 1);
            Add(Item.Stick, 4, RecipeCategory.Materials, Block.Planks, 2);
            Add(Item.Coal, 1, RecipeCategory.Materials, Block.CoalOre, 1);
            Add(Item.IronIngot, 1, RecipeCategory.Materials, Block.IronOre, 1, Item.Coal, 1);
            Add(Item.GoldIngot, 1, RecipeCategory.Materials, Block.GoldOre, 1, Item.Coal, 1);
            Add(Item.Diamond, 1, RecipeCategory.Materials, Block.DiamondOre, 1, Item.Coal, 2);
            Add(Item.DragonStone, 1, RecipeCategory.Materials, Block.DragonStoneOre, 1, Item.Coal, 3);
            Add(Item.Gunpowder, 2, RecipeCategory.Materials, Item.Coal, 1, Block.Sand, 1);
            Add(Item.Casing, 4, RecipeCategory.Materials, Item.IronIngot, 1);

            // ---- Building ----
            Add(Block.Torch, 4, RecipeCategory.Building, Item.Coal, 1, Item.Stick, 1);
            Add(Block.StoneBrick, 4, RecipeCategory.Building, Block.Cobblestone, 4);
            Add(Block.Glass, 2, RecipeCategory.Building, Block.Sand, 2, Item.Coal, 1);
            Add(Block.Sandstone, 1, RecipeCategory.Building, Block.Sand, 4);
            Add(Block.Explosive, 1, RecipeCategory.Building, Item.Gunpowder, 4, Block.Sand, 1);

            // ---- Tools ----
            Add(Item.StonePickaxe, 1, RecipeCategory.Tools, Block.Cobblestone, 3, Item.Stick, 2);
            Add(Item.IronPickaxe, 1, RecipeCategory.Tools, Item.IronIngot, 3, Item.Stick, 2);
            Add(Item.DiamondPickaxe, 1, RecipeCategory.Tools, Item.Diamond, 3, Item.Stick, 2);
            Add(Item.DragonPickaxe, 1, RecipeCategory.Tools, Item.DragonStone, 3, Item.Stick, 2);

            Add(Item.StoneAxe, 1, RecipeCategory.Tools, Block.Cobblestone, 3, Item.Stick, 2);
            Add(Item.IronAxe, 1, RecipeCategory.Tools, Item.IronIngot, 3, Item.Stick, 2);
            Add(Item.DiamondAxe, 1, RecipeCategory.Tools, Item.Diamond, 3, Item.Stick, 2);
            Add(Item.DragonAxe, 1, RecipeCategory.Tools, Item.DragonStone, 3, Item.Stick, 2);

            Add(Item.StoneShovel, 1, RecipeCategory.Tools, Block.Cobblestone, 1, Item.Stick, 2);
            Add(Item.IronShovel, 1, RecipeCategory.Tools, Item.IronIngot, 1, Item.Stick, 2);
            Add(Item.DiamondShovel, 1, RecipeCategory.Tools, Item.Diamond, 1, Item.Stick, 2);
            Add(Item.DragonShovel, 1, RecipeCategory.Tools, Item.DragonStone, 1, Item.Stick, 2);

            // ---- Weapons ----
            Add(Item.StoneSword, 1, RecipeCategory.Weapons, Block.Cobblestone, 2, Item.Stick, 1);
            Add(Item.IronSword, 1, RecipeCategory.Weapons, Item.IronIngot, 2, Item.Stick, 1);
            Add(Item.DiamondSword, 1, RecipeCategory.Weapons, Item.Diamond, 2, Item.Stick, 1);
            Add(Item.DragonSword, 1, RecipeCategory.Weapons, Item.DragonStone, 2, Item.Stick, 1);

            Add(Item.Pistol, 1, RecipeCategory.Weapons, Item.IronIngot, 3, Item.Stick, 1);
            Add(Item.Shotgun, 1, RecipeCategory.Weapons, Item.IronIngot, 5, Block.Planks, 2);
            Add(Item.AssaultRifle, 1, RecipeCategory.Weapons, Item.IronIngot, 8, Block.Planks, 2, Item.GoldIngot, 1);
            Add(Item.SniperRifle, 1, RecipeCategory.Weapons, Item.IronIngot, 6, Item.Diamond, 2, Block.Glass, 1);
            Add(Item.RocketLauncher, 1, RecipeCategory.Weapons, Item.IronIngot, 10, Item.Diamond, 2, Item.GoldIngot, 1);
            Add(Item.LaserRifle, 1, RecipeCategory.Weapons, Item.DragonStone, 4, Item.GoldIngot, 4, Item.Diamond, 2);

            // ---- Ammunition ----
            Add(Item.PistolAmmo, 8, RecipeCategory.Ammunition, Item.Casing, 1, Item.Gunpowder, 1);
            Add(Item.ShotgunShells, 4, RecipeCategory.Ammunition, Item.Casing, 1, Item.Gunpowder, 2);
            Add(Item.RifleAmmo, 12, RecipeCategory.Ammunition, Item.Casing, 2, Item.Gunpowder, 2);
            Add(Item.SniperAmmo, 4, RecipeCategory.Ammunition, Item.Casing, 2, Item.Gunpowder, 3, Item.IronIngot, 1);
            Add(Item.Rocket, 1, RecipeCategory.Ammunition, Item.IronIngot, 2, Item.Gunpowder, 6);
            Add(Item.LaserCell, 10, RecipeCategory.Ammunition, Item.GoldIngot, 1, Item.DragonStone, 1);
        }

        private static void Add(byte result, int count, RecipeCategory category,
            byte i0 = Item.None, int c0 = 0,
            byte i1 = Item.None, int c1 = 0,
            byte i2 = Item.None, int c2 = 0,
            byte i3 = Item.None, int c3 = 0)
        {
            Recipe r = new Recipe(result, count, category);
            r.IngredientIds[0] = i0; r.IngredientCounts[0] = c0;
            r.IngredientIds[1] = i1; r.IngredientCounts[1] = c1;
            r.IngredientIds[2] = i2; r.IngredientCounts[2] = c2;
            r.IngredientIds[3] = i3; r.IngredientCounts[3] = c3;
            _all.Add(r);
        }

        /// <summary>Fills <paramref name="output"/> with the recipes in one category.</summary>
        public static void GetCategory(RecipeCategory category, List<Recipe> output)
        {
            output.Clear();
            for (int i = 0; i < _all.Count; i++)
            {
                if (_all[i].Category == category) output.Add(_all[i]);
            }
        }
    }
}
