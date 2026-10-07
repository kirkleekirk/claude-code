package com.kirkleekirk.heroesendgame.weapon.stats;

import java.util.Map;

/**
 * Where things go on a gun model. All positions are in the gun body model's space (pixels): the gun points towards
 * -Z (north), +Y is up, the bore runs along x = 8.
 *
 * @param muzzle           tip of the barrel (muzzle attachments and the muzzle flash go here)
 * @param sockets          attach points per slot (OPTIC = bottom of a sight on the rail, UNDERBARREL = top of an
 *                         underbarrel part, MAGAZINE = top of the magazine at the mag well, STOCK = front of the
 *                         stock, BARREL = where a barrel shroud/extension starts)
 * @param sightLine        a point on the iron-sight line; aiming centres this on screen
 * @param separateMagazine the magazine is its own model ({@code item/gun/<id>_mag}) so reloads can animate it
 * @param separateStock    the stock is its own model ({@code item/gun/<id>_stock}) so stock attachments can replace it
 * @param twoHanded        held with both hands (everything but pistols)
 * @param grip             where the trigger hand holds the pistol grip (the off hand goes to the UNDERBARREL socket)
 */
public record GunVisual(Vec3f muzzle, Map<AttachmentSlot, Vec3f> sockets, Vec3f sightLine, boolean separateMagazine,
                        boolean separateStock, boolean twoHanded, Vec3f grip) {
    public Vec3f socket(AttachmentSlot slot) {
        if (slot == AttachmentSlot.MUZZLE) {
            return muzzle;
        }
        return sockets.get(slot);
    }
}
