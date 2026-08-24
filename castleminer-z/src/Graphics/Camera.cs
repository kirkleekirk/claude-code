using Microsoft.Xna.Framework;

namespace CastleMinerZ.Graphics
{
    /// <summary>
    /// First-person camera and the frustum used to cull chunks.
    ///
    /// The far plane is pulled in to just past the streaming radius: on the 360 there is no
    /// value in a 1000-unit far plane when fog has already saturated at 90, and the tighter
    /// range gives the depth buffer far better precision at close distances, which is what
    /// stops z-fighting on the block you are standing on.
    /// </summary>
    public sealed class Camera
    {
        public Vector3 Position;
        public float Yaw;
        public float Pitch;

        public Matrix View;
        public Matrix Projection;
        public Matrix ViewProjection;

        public BoundingFrustum Frustum = new BoundingFrustum(Matrix.Identity);

        public float FieldOfView = MathHelper.ToRadians(72.0f);
        public float NearPlane = 0.12f;
        public float FarPlane = 260.0f;
        public float AspectRatio = 16.0f / 9.0f;

        public Vector3 Forward;
        public Vector3 Right;
        public Vector3 Up;

        public void SetPerspective(float aspectRatio, float farPlane)
        {
            AspectRatio = aspectRatio;
            FarPlane = farPlane;
        }

        public void Update()
        {
            float cosPitch = (float)System.Math.Cos(Pitch);
            Forward = new Vector3(
                (float)System.Math.Sin(Yaw) * cosPitch,
                (float)System.Math.Sin(Pitch),
                (float)System.Math.Cos(Yaw) * cosPitch);
            Forward.Normalize();

            // Right-handed basis: Forward x WorldUp gives the camera's right. Taking the
            // cross the other way round yields a left-pointing vector, which the view matrix
            // hides (CreateLookAt only needs an up vector) but which would silently mirror
            // stereo panning and particle billboards.
            Right = Vector3.Cross(Forward, Vector3.Up);
            if (Right.LengthSquared() < 1e-6f) Right = Vector3.Right;
            Right.Normalize();

            Up = Vector3.Cross(Right, Forward);

            View = Matrix.CreateLookAt(Position, Position + Forward, Up);
            Projection = Matrix.CreatePerspectiveFieldOfView(FieldOfView, AspectRatio, NearPlane, FarPlane);
            ViewProjection = View * Projection;
            Frustum.Matrix = ViewProjection;
        }

        public bool IsVisible(ref BoundingBox box)
        {
            return Frustum.Intersects(box);
        }
    }
}
