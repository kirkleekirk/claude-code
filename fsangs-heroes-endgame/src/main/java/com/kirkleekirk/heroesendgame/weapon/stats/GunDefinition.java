package com.kirkleekirk.heroesendgame.weapon.stats;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A gun: base stats, fire modes, ammo, which gunsmith slots it takes and where attachments sit on its model.
 *
 * @param defaultEffect what its rounds do without an Ammo Type attachment (e.g. the I.C.E.R. stuns)
 * @param soundSet sound family: sounds are heroes_endgame:gun.&lt;soundSet&gt;.{fire,fire_suppressed,reload,
 *                 reload_empty,dry,mech} (see WeaponSounds)
 */
public record GunDefinition(String id, WeaponClass weaponClass, List<FireMode> fireModes, AmmoType ammo, WeaponStats base,
                            Set<Trait> traits, Set<AttachmentSlot> slots, Set<String> excluded, String soundSet,
                            String character, GunVisual visual, AmmoEffect defaultEffect) implements WeaponDefinition {

    public static Builder builder(String id, WeaponClass weaponClass) {
        return new Builder(id, weaponClass);
    }

    public static final class Builder {
        private final String id;
        private final WeaponClass weaponClass;
        private final List<FireMode> fireModes = new ArrayList<>();
        private AmmoType ammo = AmmoType.RIFLE;
        private final WeaponStats.Builder stats = WeaponStats.builder();
        private final Set<Trait> traits = EnumSet.noneOf(Trait.class);
        private final Set<AttachmentSlot> slots = EnumSet.noneOf(AttachmentSlot.class);
        private final Set<String> excluded = new LinkedHashSet<>();
        private String soundSet = "rifle";
        private String character = "";
        private Vec3f muzzle = Vec3f.of(8, 10, -16);
        private final Map<AttachmentSlot, Vec3f> sockets = new EnumMap<>(AttachmentSlot.class);
        private Vec3f sightLine = Vec3f.of(8, 12, 4);
        private boolean separateMagazine = true;
        private boolean separateStock = false;
        private boolean twoHanded = true;
        private AmmoEffect defaultEffect = AmmoEffect.NONE;

        private Builder(String id, WeaponClass weaponClass) {
            this.id = id;
            this.weaponClass = weaponClass;
        }

        public Builder modes(FireMode... modes) {
            fireModes.clear();
            fireModes.addAll(List.of(modes));
            return this;
        }

        public Builder ammo(AmmoType ammo) {
            this.ammo = ammo;
            return this;
        }

        public Builder stat(Stat stat, double value) {
            stats.set(stat, value);
            return this;
        }

        public Builder traits(Trait... values) {
            traits.addAll(List.of(values));
            return this;
        }

        /** Gunsmith slots; defaults to all ten gun slots if never called. */
        public Builder slots(AttachmentSlot... values) {
            slots.addAll(List.of(values));
            return this;
        }

        public Builder exclude(String... attachmentIds) {
            excluded.addAll(List.of(attachmentIds));
            return this;
        }

        public Builder sound(String soundSet) {
            this.soundSet = soundSet;
            return this;
        }

        public Builder character(String character) {
            this.character = character;
            return this;
        }

        public Builder muzzle(double x, double y, double z) {
            this.muzzle = Vec3f.of(x, y, z);
            return this;
        }

        public Builder socket(AttachmentSlot slot, double x, double y, double z) {
            sockets.put(slot, Vec3f.of(x, y, z));
            return this;
        }

        public Builder sightLine(double x, double y, double z) {
            this.sightLine = Vec3f.of(x, y, z);
            return this;
        }

        public Builder separateMagazine(boolean value) {
            this.separateMagazine = value;
            return this;
        }

        public Builder separateStock(boolean value) {
            this.separateStock = value;
            return this;
        }

        public Builder effect(AmmoEffect effect) {
            this.defaultEffect = effect;
            return this;
        }

        public Builder oneHanded() {
            this.twoHanded = false;
            return this;
        }

        public GunDefinition build() {
            if (fireModes.isEmpty()) {
                fireModes.add(FireMode.SEMI);
            }
            Set<AttachmentSlot> finalSlots = slots.isEmpty() ? EnumSet.of(AttachmentSlot.MUZZLE, AttachmentSlot.BARREL,
                    AttachmentSlot.OPTIC, AttachmentSlot.STOCK, AttachmentSlot.UNDERBARREL, AttachmentSlot.MAGAZINE,
                    AttachmentSlot.AMMO_TYPE, AttachmentSlot.REAR_GRIP, AttachmentSlot.PROFICIENCY, AttachmentSlot.KIT)
                    : EnumSet.copyOf(slots);
            GunVisual visual = new GunVisual(muzzle, Map.copyOf(sockets), sightLine, separateMagazine, separateStock, twoHanded);
            return new GunDefinition(id, weaponClass, List.copyOf(fireModes), ammo, stats.build(),
                    traits.isEmpty() ? Set.of() : EnumSet.copyOf(traits), finalSlots, Set.copyOf(excluded), soundSet,
                    character, visual, defaultEffect);
        }
    }
}
