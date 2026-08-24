using Microsoft.Xna.Framework;

namespace CastleMinerZ.World
{
    /// <summary>Result of a ray against the voxel grid.</summary>
    public struct RayHit
    {
        public bool Hit;

        /// <summary>Block that was struck.</summary>
        public int X, Y, Z;

        /// <summary>Cell adjacent to the struck face -- where a placed block would go.</summary>
        public int AdjacentX, AdjacentY, AdjacentZ;

        public byte BlockId;
        public float Distance;
        public Vector3 Normal;
    }

    /// <summary>
    /// Amanatides-Woo voxel traversal: steps exactly the cells the ray passes through,
    /// with no sampling gaps and no dependence on step size.
    ///
    /// Used for the mining/placement cursor and for hitscan weapons, so it has to be exact
    /// -- a stepping raycast will happily shoot through the corner between two blocks.
    /// </summary>
    public static class VoxelRaycast
    {
        public static RayHit Cast(World world, Vector3 origin, Vector3 direction, float maxDistance, bool hitLiquids)
        {
            RayHit result = new RayHit();

            if (direction.LengthSquared() < 1e-8f) return result;
            direction.Normalize();

            int x = (int)System.Math.Floor(origin.X);
            int y = (int)System.Math.Floor(origin.Y);
            int z = (int)System.Math.Floor(origin.Z);

            int stepX = direction.X > 0.0f ? 1 : (direction.X < 0.0f ? -1 : 0);
            int stepY = direction.Y > 0.0f ? 1 : (direction.Y < 0.0f ? -1 : 0);
            int stepZ = direction.Z > 0.0f ? 1 : (direction.Z < 0.0f ? -1 : 0);

            float tDeltaX = stepX != 0 ? System.Math.Abs(1.0f / direction.X) : float.MaxValue;
            float tDeltaY = stepY != 0 ? System.Math.Abs(1.0f / direction.Y) : float.MaxValue;
            float tDeltaZ = stepZ != 0 ? System.Math.Abs(1.0f / direction.Z) : float.MaxValue;

            float tMaxX = stepX != 0 ? BoundaryDistance(origin.X, x, stepX, direction.X) : float.MaxValue;
            float tMaxY = stepY != 0 ? BoundaryDistance(origin.Y, y, stepY, direction.Y) : float.MaxValue;
            float tMaxZ = stepZ != 0 ? BoundaryDistance(origin.Z, z, stepZ, direction.Z) : float.MaxValue;

            int lastX = x, lastY = y, lastZ = z;
            float travelled = 0.0f;

            while (travelled <= maxDistance)
            {
                byte id = world.GetBlock(x, y, z);
                if (id != Block.Air)
                {
                    BlockDefinition def = BlockRegistry.Get(id);
                    if (def.IsSolid || (hitLiquids && def.IsLiquid))
                    {
                        result.Hit = true;
                        result.X = x;
                        result.Y = y;
                        result.Z = z;
                        result.AdjacentX = lastX;
                        result.AdjacentY = lastY;
                        result.AdjacentZ = lastZ;
                        result.BlockId = id;
                        result.Distance = travelled;
                        result.Normal = new Vector3(lastX - x, lastY - y, lastZ - z);
                        return result;
                    }
                }

                lastX = x;
                lastY = y;
                lastZ = z;

                if (tMaxX < tMaxY)
                {
                    if (tMaxX < tMaxZ) { x += stepX; travelled = tMaxX; tMaxX += tDeltaX; }
                    else { z += stepZ; travelled = tMaxZ; tMaxZ += tDeltaZ; }
                }
                else
                {
                    if (tMaxY < tMaxZ) { y += stepY; travelled = tMaxY; tMaxY += tDeltaY; }
                    else { z += stepZ; travelled = tMaxZ; tMaxZ += tDeltaZ; }
                }
            }

            return result;
        }

        private static float BoundaryDistance(float origin, int cell, int step, float direction)
        {
            float boundary = step > 0 ? cell + 1.0f : cell;
            return (boundary - origin) / direction;
        }
    }
}
