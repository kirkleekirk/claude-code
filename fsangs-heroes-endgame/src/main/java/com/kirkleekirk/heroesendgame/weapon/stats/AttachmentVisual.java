package com.kirkleekirk.heroesendgame.weapon.stats;

/**
 * How an attachment shows up on the gun.
 *
 * @param model        model path under models/item ("attachment/suppressor"), or null for invisible attachments
 *                     (ammo types, proficiencies, kits, grips). Authored with the attach point at (8, 8, 8) and the
 *                     same axes as guns (forward = -Z, up = +Y): muzzle parts extend towards -Z, optics upwards,
 *                     underbarrel parts and magazines downwards, stocks towards +Z.
 * @param lengthOffset barrels and muzzle devices: how many pixels they move the muzzle point forward (towards -Z) -
 *                     the muzzle flash and muzzle attachments move with it (negative = shorter)
 * @param sightHeight  optics: height of the reticle above the attach point (aiming lines it up)
 */
public record AttachmentVisual(String model, float lengthOffset, float sightHeight) {
    public static final AttachmentVisual NONE = new AttachmentVisual(null, 0.0F, 0.0F);

    public static AttachmentVisual model(String model) {
        return new AttachmentVisual(model, 0.0F, 0.0F);
    }

    public static AttachmentVisual barrel(String model, float lengthOffset) {
        return new AttachmentVisual(model, lengthOffset, 0.0F);
    }

    public static AttachmentVisual optic(String model, float sightHeight) {
        return new AttachmentVisual(model, 0.0F, sightHeight);
    }
}
