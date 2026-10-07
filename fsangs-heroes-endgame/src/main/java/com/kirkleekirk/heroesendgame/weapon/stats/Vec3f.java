package com.kirkleekirk.heroesendgame.weapon.stats;

/** A point in model space (units = pixels, 16 = one block). */
public record Vec3f(float x, float y, float z) {
    public static Vec3f of(double x, double y, double z) {
        return new Vec3f((float) x, (float) y, (float) z);
    }

    public Vec3f add(float dx, float dy, float dz) {
        return new Vec3f(x + dx, y + dy, z + dz);
    }
}
