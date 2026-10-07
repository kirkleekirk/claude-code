package com.kirkleekirk.heroesendgame.weapon.stats;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** The gunsmith maths: pure functions, unit tested. */
public final class WeaponCalc {
    private WeaponCalc() {
    }

    /** Can {@code attachment} go on {@code weapon} given what is already attached (its own slot is ignored)? */
    public static Compatibility check(WeaponDefinition weapon, Map<AttachmentSlot, AttachmentDefinition> current,
                                      AttachmentDefinition attachment) {
        if (!weapon.slots().contains(attachment.slot())) {
            return Compatibility.NO_SLOT;
        }
        if (!attachment.fits(weapon.weaponClass())) {
            return Compatibility.WRONG_CLASS;
        }
        if (weapon.excluded().contains(attachment.id())) {
            return Compatibility.EXCLUDED;
        }
        for (Map.Entry<AttachmentSlot, AttachmentDefinition> entry : current.entrySet()) {
            if (entry.getKey() == attachment.slot()) {
                continue;
            }
            if (entry.getValue().blocks().contains(attachment.slot()) || attachment.blocks().contains(entry.getKey())) {
                return Compatibility.BLOCKED;
            }
        }
        return Compatibility.OK;
    }

    /** Slots that the current attachments make unusable. */
    public static Set<AttachmentSlot> blockedSlots(Map<AttachmentSlot, AttachmentDefinition> current) {
        Set<AttachmentSlot> blocked = EnumSet.noneOf(AttachmentSlot.class);
        for (AttachmentDefinition attachment : current.values()) {
            blocked.addAll(attachment.blocks());
        }
        return blocked;
    }

    /** Applies attachments (in slot order) to a gun. Fire-mode conversions: the last one wins. */
    public static ComputedWeapon compute(GunDefinition gun, Map<AttachmentSlot, AttachmentDefinition> attachments) {
        List<StatModifier> modifiers = new ArrayList<>();
        Set<Trait> traits = EnumSet.noneOf(Trait.class);
        traits.addAll(gun.traits());
        List<FireMode> modes = gun.fireModes();
        AmmoEffect effect = gun.defaultEffect();
        for (AttachmentSlot slot : AttachmentSlot.values()) {
            AttachmentDefinition attachment = attachments.get(slot);
            if (attachment == null) {
                continue;
            }
            modifiers.addAll(attachment.modifiers());
            traits.addAll(attachment.traits());
            if (attachment.fireModes() != null && !attachment.fireModes().isEmpty()) {
                modes = attachment.fireModes();
            }
            if (attachment.ammoEffect() != AmmoEffect.NONE) {
                effect = attachment.ammoEffect();
            }
        }
        return new ComputedWeapon(gun.base().apply(modifiers), List.copyOf(modes), traits, effect);
    }

    /** Same for melee weapons (no fire modes). */
    public static ComputedWeapon compute(MeleeDefinition melee, Map<AttachmentSlot, AttachmentDefinition> attachments) {
        List<StatModifier> modifiers = new ArrayList<>();
        Set<Trait> traits = EnumSet.noneOf(Trait.class);
        AmmoEffect effect = AmmoEffect.NONE;
        for (AttachmentSlot slot : AttachmentSlot.values()) {
            AttachmentDefinition attachment = attachments.get(slot);
            if (attachment == null) {
                continue;
            }
            modifiers.addAll(attachment.modifiers());
            traits.addAll(attachment.traits());
            if (attachment.ammoEffect() != AmmoEffect.NONE) {
                effect = attachment.ammoEffect();
            }
        }
        return new ComputedWeapon(melee.base().apply(modifiers), List.of(), traits, effect);
    }
}
