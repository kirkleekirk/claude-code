using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;
using CastleMinerZ.Core;
using CastleMinerZ.Items;

namespace CastleMinerZ.UI
{
    /// <summary>
    /// Inventory and crafting, on two tabs of one screen.
    ///
    /// Crafting has no bench and no grid: every recipe you have the ingredients for is
    /// listed, wherever you are standing. That is what makes a long expedition survivable --
    /// you can turn ore into ammunition six kilometres from home, in a hole, at night.
    /// </summary>
    public sealed class InventoryScreen : GameScreen
    {
        private const int Columns = 8;
        private const int SlotSize = 56;
        private const int SlotGap = 6;

        private readonly GameSession _session;
        private readonly List<Recipe> _visibleRecipes = new List<Recipe>(24);

        private bool _craftingTab;
        private int _cursor;
        private int _heldSlot = -1;
        private RecipeCategory _category = RecipeCategory.Materials;
        private int _recipeScroll;

        private const int RecipeRows = 8;

        public InventoryScreen(GameSession session, bool startOnCrafting)
        {
            _session = session;
            _craftingTab = startOnCrafting;
            IsPopup = true;
            PausesGame = true;
            CapturesLook = false;
        }

        public override void OnEnter()
        {
            RefreshRecipes();
        }

        private void RefreshRecipes()
        {
            RecipeBook.GetCategory(_category, _visibleRecipes);
            if (_cursor >= _visibleRecipes.Count) _cursor = System.Math.Max(0, _visibleRecipes.Count - 1);
            _recipeScroll = 0;
        }

        public override void Update(float dt, InputManager input)
        {
            // Shoulder buttons switch tab, then category within the crafting tab.
            if (input.Pressed(Buttons.LeftShoulder))
            {
                if (_craftingTab && _category > RecipeCategory.Materials)
                {
                    _category--;
                    RefreshRecipes();
                }
                else
                {
                    _craftingTab = false;
                    _cursor = 0;
                }
                Manager.Audio.Play2D(SoundId.MenuMove, 0.5f, 0.0f);
                return;
            }

            if (input.Pressed(Buttons.RightShoulder))
            {
                if (!_craftingTab)
                {
                    _craftingTab = true;
                    _cursor = 0;
                    RefreshRecipes();
                }
                else if (_category < RecipeCategory.Ammunition)
                {
                    _category++;
                    RefreshRecipes();
                }
                Manager.Audio.Play2D(SoundId.MenuMove, 0.5f, 0.0f);
                return;
            }

            if (input.MenuCancel())
            {
                Manager.Pop();
                return;
            }

            if (_craftingTab) UpdateCrafting(input);
            else UpdateInventory(input);
        }

        private void UpdateInventory(InputManager input)
        {
            int horizontal = input.MenuHorizontal();
            int vertical = input.MenuVertical();

            if (horizontal != 0 || vertical != 0)
            {
                _cursor += horizontal + vertical * Columns;
                if (_cursor < 0) _cursor += Inventory.TotalSlots;
                if (_cursor >= Inventory.TotalSlots) _cursor -= Inventory.TotalSlots;
                Manager.Audio.Play2D(SoundId.MenuMove, 0.4f, 0.0f);
            }

            if (input.MenuAccept())
            {
                Inventory inventory = _session.Player.Inventory;

                if (_heldSlot < 0)
                {
                    if (!inventory[_cursor].IsEmpty) _heldSlot = _cursor;
                }
                else
                {
                    inventory.Swap(_heldSlot, _cursor);
                    _heldSlot = -1;
                }
                Manager.Audio.Play2D(SoundId.MenuSelect, 0.6f, 0.0f);
            }

            // X drops the whole stack under the cursor at the player's feet.
            if (input.Pressed(Buttons.X))
            {
                Inventory inventory = _session.Player.Inventory;
                ItemStack stack = inventory[_cursor];
                if (!stack.IsEmpty)
                {
                    Vector3 at = _session.Player.Position + _session.Player.ForwardFlat * 1.2f
                        + new Vector3(0.0f, 1.0f, 0.0f);
                    _session.Drops.Spawn(at, stack.Id, stack.Count);
                    inventory[_cursor] = ItemStack.Empty;
                    _heldSlot = -1;
                }
            }
        }

        private void UpdateCrafting(InputManager input)
        {
            int vertical = input.MenuVertical();
            if (vertical != 0 && _visibleRecipes.Count > 0)
            {
                _cursor += vertical;
                if (_cursor < 0) _cursor = _visibleRecipes.Count - 1;
                if (_cursor >= _visibleRecipes.Count) _cursor = 0;

                if (_cursor < _recipeScroll) _recipeScroll = _cursor;
                if (_cursor >= _recipeScroll + RecipeRows) _recipeScroll = _cursor - RecipeRows + 1;

                Manager.Audio.Play2D(SoundId.MenuMove, 0.4f, 0.0f);
            }

            if (input.MenuAccept() && _cursor < _visibleRecipes.Count)
            {
                Recipe recipe = _visibleRecipes[_cursor];
                if (recipe.Craft(_session.Player.Inventory))
                {
                    _session.AddNotice("CRAFTED " + ItemRegistry.NameOf(recipe.Result));
                    Manager.Audio.Play2D(SoundId.MenuSelect, 0.8f, 0.1f);
                }
                else
                {
                    Manager.Audio.Play2D(SoundId.MenuMove, 0.6f, -0.6f);
                }
            }
        }

        public override void Draw(SpriteBatch batch, float dt)
        {
            Rectangle safe = Manager.SafeArea;
            Viewport viewport = Manager.Device.Viewport;
            Manager.FillRect(new Rectangle(0, 0, viewport.Width, viewport.Height), Theme.Background);

            float centreX = safe.X + safe.Width * 0.5f;
            Manager.DrawTitleCentred(_craftingTab ? "CRAFTING" : "INVENTORY", centreX, safe.Y + 12, Theme.Text);

            DrawTabs(safe, centreX);

            if (_craftingTab) DrawCrafting(safe, centreX);
            else DrawInventory(safe, centreX);

            Manager.DrawTextCentred(
                _craftingTab ? "(A) CRAFT     (LB/RB) CATEGORY     (B) CLOSE"
                             : "(A) PICK UP / PLACE     (X) DROP     (RB) CRAFTING     (B) CLOSE",
                centreX, safe.Bottom - 34, Theme.TextDim);
        }

        private void DrawTabs(Rectangle safe, float centreX)
        {
            string left = _craftingTab ? "< INVENTORY" : "";
            string right = _craftingTab ? "" : "CRAFTING >";

            if (left.Length > 0) Manager.DrawShadowedText(left, new Vector2(safe.X + 20, safe.Y + 24), Theme.TextDim);
            if (right.Length > 0)
            {
                Vector2 size = Manager.Font != null ? Manager.Font.MeasureString(right) : Vector2.Zero;
                Manager.DrawShadowedText(right, new Vector2(safe.Right - 20 - size.X, safe.Y + 24), Theme.TextDim);
            }
        }

        private void DrawInventory(Rectangle safe, float centreX)
        {
            Inventory inventory = _session.Player.Inventory;

            int gridWidth = Columns * SlotSize + (Columns - 1) * SlotGap;
            int x0 = (int)(centreX - gridWidth * 0.5f);
            int y0 = safe.Y + 96;

            // Hotbar first, then a gap, then the backpack -- the layout matches the HUD so
            // the mapping between the two is obvious.
            for (int i = 0; i < Inventory.TotalSlots; i++)
            {
                int row = i / Columns;
                int column = i % Columns;
                int y = y0 + row * (SlotSize + SlotGap) + (row > 0 ? 18 : 0);

                Rectangle rect = new Rectangle(x0 + column * (SlotSize + SlotGap), y, SlotSize, SlotSize);

                Manager.DrawSlot(rect, inventory[i], i == _cursor);

                if (i == _heldSlot)
                {
                    Manager.DrawBorder(rect, 3, Theme.TextGood);
                }
            }

            ItemStack hovered = inventory[_cursor];
            if (!hovered.IsEmpty)
            {
                int bottom = y0 + 4 * (SlotSize + SlotGap) + 40;
                Manager.DrawTextCentred(hovered.Definition.Name, centreX, bottom, Theme.Text);
                Manager.DrawTextCentred(DescribeItem(hovered), centreX, bottom + 26, Theme.TextDim);
            }
        }

        private static string DescribeItem(ItemStack stack)
        {
            ItemDefinition def = stack.Definition;

            if (def.IsFirearm)
            {
                return def.GunDamage + " DMG    " + stack.Data + "/" + def.MagazineSize + " LOADED    "
                    + (int)def.GunRange + "m RANGE";
            }
            if (def.Tool != World.ToolClass.None)
            {
                return def.Tool.ToString().ToUpper() + "    TIER " + def.Tier
                    + "    x" + def.MiningMultiplier.ToString("0.0") + " SPEED";
            }
            if (def.MeleeDamage > 3)
            {
                return def.MeleeDamage + " MELEE DAMAGE    TIER " + def.Tier;
            }
            if (def.IsPlaceable)
            {
                return "PLACEABLE BLOCK";
            }
            return "MATERIAL";
        }

        private void DrawCrafting(Rectangle safe, float centreX)
        {
            Inventory inventory = _session.Player.Inventory;

            string categoryText = _category.ToString().ToUpper();
            Manager.DrawTextCentred("< " + categoryText + " >", centreX, safe.Y + 62, Theme.SlotSelected);

            int panelWidth = 720;
            int rowHeight = 46;
            Rectangle panel = new Rectangle(
                (int)(centreX - panelWidth * 0.5f), safe.Y + 100,
                panelWidth, RecipeRows * rowHeight + 16);
            Manager.DrawPanel(panel);

            int shown = System.Math.Min(RecipeRows, _visibleRecipes.Count - _recipeScroll);

            for (int r = 0; r < shown; r++)
            {
                int index = _recipeScroll + r;
                Recipe recipe = _visibleRecipes[index];
                bool canCraft = recipe.CanCraft(inventory);
                bool selected = index == _cursor;

                int y = panel.Y + 8 + r * rowHeight;
                Rectangle row = new Rectangle(panel.X + 6, y, panel.Width - 12, rowHeight - 4);

                if (selected) Manager.FillRect(row, Theme.Highlight);

                Manager.DrawItemIcon(recipe.Result, new Rectangle(row.X + 6, row.Y + 4, 34, 34));

                Color nameColour = canCraft ? Theme.Text : new Color(120, 122, 130);
                string name = ItemRegistry.NameOf(recipe.Result);
                if (recipe.ResultCount > 1) name += " x" + recipe.ResultCount;
                Manager.DrawShadowedText(name, new Vector2(row.X + 50, row.Y + 10), nameColour);

                DrawIngredients(recipe, inventory, row);
            }

            if (_visibleRecipes.Count > RecipeRows)
            {
                Manager.DrawTextCentred((_cursor + 1) + " / " + _visibleRecipes.Count,
                    centreX, panel.Bottom + 8, Theme.TextDim);
            }
        }

        private void DrawIngredients(Recipe recipe, Inventory inventory, Rectangle row)
        {
            int x = row.Right - 20;

            for (int i = recipe.IngredientIds.Length - 1; i >= 0; i--)
            {
                byte id = recipe.IngredientIds[i];
                if (id == Item.None) continue;

                int required = recipe.IngredientCounts[i];
                int held = inventory.CountOf(id);

                string text = held + "/" + required;
                Vector2 size = Manager.Font != null ? Manager.Font.MeasureString(text) : Vector2.Zero;

                x -= (int)size.X;
                Manager.DrawShadowedText(text, new Vector2(x, row.Y + 12),
                    held >= required ? Theme.TextGood : Theme.TextBad);

                x -= 36;
                Manager.DrawItemIcon(id, new Rectangle(x, row.Y + 8, 30, 30));
                x -= 12;
            }
        }
    }
}
