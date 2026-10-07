package com.kirkleekirk.heroesendgame.weapon.stats;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * A gunsmith attachment.
 *
 * @param classes    weapon classes it fits (empty = every class that has the slot)
 * @param fireModes  conversion kits replace the weapon's fire modes (null = unchanged)
 * @param blocks     slots that become unusable while this is attached (e.g. akimbo blocks optics and underbarrels)
 * @param rarity     0 common .. 3 legendary (crafting cost and tooltip colour)
 */
public record AttachmentDefinition(String id, AttachmentSlot slot, List<StatModifier> modifiers, Set<Trait> traits,
                                   AmmoEffect ammoEffect, Set<WeaponClass> classes, List<FireMode> fireModes,
                                   Set<AttachmentSlot> blocks, int rarity, AttachmentVisual visual) {

    public static Builder builder(String id, AttachmentSlot slot) {
        return new Builder(id, slot);
    }

    public boolean fits(WeaponClass weaponClass) {
        return classes.isEmpty() || classes.contains(weaponClass);
    }

    public static final class Builder {
        private final String id;
        private final AttachmentSlot slot;
        private final List<StatModifier> modifiers = new ArrayList<>();
        private final Set<Trait> traits = EnumSet.noneOf(Trait.class);
        private AmmoEffect ammoEffect = AmmoEffect.NONE;
        private final Set<WeaponClass> classes = EnumSet.noneOf(WeaponClass.class);
        private List<FireMode> fireModes;
        private final Set<AttachmentSlot> blocks = EnumSet.noneOf(AttachmentSlot.class);
        private int rarity;
        private AttachmentVisual visual = AttachmentVisual.NONE;

        private Builder(String id, AttachmentSlot slot) {
            this.id = id;
            this.slot = slot;
        }

        public Builder mod(StatModifier modifier) {
            modifiers.add(modifier);
            return this;
        }

        /** Shorthand: +/- percent. */
        public Builder pct(Stat stat, double percent) {
            return mod(StatModifier.percent(stat, percent));
        }

        public Builder add(Stat stat, double amount) {
            return mod(StatModifier.add(stat, amount));
        }

        public Builder set(Stat stat, double value) {
            return mod(StatModifier.set(stat, value));
        }

        public Builder traits(Trait... values) {
            traits.addAll(List.of(values));
            return this;
        }

        public Builder effect(AmmoEffect effect) {
            this.ammoEffect = effect;
            return this;
        }

        public Builder classes(WeaponClass... values) {
            classes.addAll(List.of(values));
            return this;
        }

        public Builder modes(FireMode... modes) {
            this.fireModes = List.of(modes);
            return this;
        }

        public Builder blocks(AttachmentSlot... slots) {
            blocks.addAll(List.of(slots));
            return this;
        }

        public Builder rarity(int rarity) {
            this.rarity = rarity;
            return this;
        }

        public Builder visual(AttachmentVisual visual) {
            this.visual = visual;
            return this;
        }

        public AttachmentDefinition build() {
            return new AttachmentDefinition(id, slot, List.copyOf(modifiers), traits.isEmpty() ? Set.of() : EnumSet.copyOf(traits),
                    ammoEffect, classes.isEmpty() ? Set.of() : EnumSet.copyOf(classes), fireModes,
                    blocks.isEmpty() ? Set.of() : EnumSet.copyOf(blocks), rarity, visual);
        }
    }
}
