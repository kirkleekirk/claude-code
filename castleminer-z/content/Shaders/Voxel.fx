//-----------------------------------------------------------------------------
// Voxel.fx -- terrain and water for CastleMiner Z.
//
// Compiles to vs_3_0 / ps_3_0, which is what the Xbox 360 HiDef profile requires.
//
// The vertex format this unpacks is 12 bytes: a quarter-block chunk-local position,
// an atlas tile index with a 0/1 corner selector, and baked light. Doing the unpack
// on the GPU is what keeps the vertex buffers small enough to hold a full view
// radius in memory on the console.
//-----------------------------------------------------------------------------

float4x4 ViewProjection;

// World-space corner of the section being drawn. Positions arrive chunk-local.
float3 ChunkOrigin;

float3 FogColour;
float2 FogRange;          // x = start distance, y = full-fog distance

// Scales the baked sky-light channel. Driving night from here rather than from the
// vertex data means a full day/night cycle costs no re-meshing.
float SunIntensity;

// Per-column foliage colour. Grass and leaves are grey in the atlas and tinted here.
float3 FoliageTint;

float3 CameraPosition;
float3 FlashlightDirection;
float FlashlightStrength;

// Scrolls water UVs. Fed the game clock.
float WaterTime;

texture AtlasTexture;

sampler2D Atlas = sampler_state
{
    Texture = <AtlasTexture>;
    MinFilter = Point;
    MagFilter = Point;
    MipFilter = None;
    AddressU = Clamp;
    AddressV = Clamp;
};

// Must match ChunkMesher.Q.
#define POSITION_SCALE  0.25

// 16x16 tiles in a 256x256 atlas.
#define TILE_SIZE       0.0625
#define TEXEL_INSET     0.00195313   // half a texel, to stop neighbouring tiles bleeding in

// Warm tint for torch and lava light, so artificial light reads differently from daylight.
static const float3 TorchColour = float3(1.0, 0.76, 0.48);

struct VertexIn
{
    // xyz: chunk-local position in quarter blocks (0..64). w: face index 0..5.
    float4 Position   : POSITION0;
    // xy: atlas tile column/row. zw: 0/1 corner within the tile.
    float4 TileCorner : TEXCOORD0;
    // r: block light. g: sky light. b: foliage tint amount. a: ambient occlusion.
    float4 Light      : COLOR0;
};

struct VertexOut
{
    float4 Position : POSITION0;
    float2 TexCoord : TEXCOORD0;
    float3 WorldPos : TEXCOORD1;
    float  Fog      : TEXCOORD2;
    // rgb: resolved light colour. a: foliage tint amount.
    float4 Lighting : COLOR0;
};

// Flat per-face shading. Without this a lit cube has no readable silhouette, because
// every face carries the same baked light value.
float FaceShade(float face)
{
    if (face < 1.5) return 0.72;   // -X, +X
    if (face < 2.5) return 0.52;   // -Y
    if (face < 3.5) return 1.00;   // +Y
    return 0.86;                   // -Z, +Z
}

VertexOut VertexShaderCommon(VertexIn input)
{
    VertexOut output;

    float3 world = ChunkOrigin + input.Position.xyz * POSITION_SCALE;
    output.WorldPos = world;
    output.Position = mul(float4(world, 1.0), ViewProjection);

    // Byte4 arrives unnormalised, so tile indices are already 0..15 and the corner
    // selector is already 0 or 1.
    float2 corner = input.TileCorner.zw;
    float2 uv = (input.TileCorner.xy + corner) * TILE_SIZE;
    // Pull each corner half a texel toward the middle of its tile.
    uv += (0.5 - corner) * (2.0 * TEXEL_INSET);
    output.TexCoord = uv;

    float blockLight = input.Light.r;
    float skyLight   = input.Light.g * SunIntensity;
    float ao         = input.Light.a;

    float3 lit = saturate(float3(skyLight, skyLight, skyLight) + TorchColour * blockLight);
    lit = max(lit, 0.05);                     // caves are dark, never pure black
    lit *= ao * FaceShade(input.Position.w);

    output.Lighting = float4(lit, input.Light.b);

    float distance = length(world - CameraPosition);
    output.Fog = saturate((distance - FogRange.x) / max(FogRange.y - FogRange.x, 0.001));

    return output;
}

// Handheld flashlight: a tight cone from the camera, which is the only light source
// that matters once you are far enough underground.
float3 ApplyFlashlight(float3 colour, float3 albedo, float3 worldPos)
{
    if (FlashlightStrength <= 0.0) return colour;

    float3 toPixel = worldPos - CameraPosition;
    float distance = length(toPixel);
    toPixel /= max(distance, 0.001);

    float cone = saturate(dot(toPixel, FlashlightDirection));
    cone = pow(cone, 26.0);

    float attenuation = saturate(1.0 - distance / 30.0);
    return colour + albedo * cone * attenuation * FlashlightStrength;
}

float4 PixelShaderTerrain(VertexOut input) : COLOR0
{
    float4 texel = tex2D(Atlas, input.TexCoord);

    // Cutout blocks (leaves, torches) are alpha tested rather than blended, so they
    // stay in the opaque pass and still write depth.
    clip(texel.a - 0.5);

    float3 albedo = lerp(texel.rgb, texel.rgb * FoliageTint, input.Lighting.a);
    float3 colour = albedo * input.Lighting.rgb;
    colour = ApplyFlashlight(colour, albedo, input.WorldPos);
    colour = lerp(colour, FogColour, input.Fog);

    return float4(colour, 1.0);
}

float4 PixelShaderWater(VertexOut input) : COLOR0
{
    // A slow diagonal scroll inside the tile is enough to read as flowing water without
    // needing a second texture or an animated atlas.
    float2 uv = input.TexCoord;
    uv.x += sin(WaterTime * 0.6 + input.WorldPos.z * 0.35) * 0.0015;
    uv.y += cos(WaterTime * 0.5 + input.WorldPos.x * 0.35) * 0.0015;

    float4 texel = tex2D(Atlas, uv);

    float3 albedo = lerp(texel.rgb, texel.rgb * FoliageTint, input.Lighting.a);
    float3 colour = albedo * input.Lighting.rgb;
    colour = ApplyFlashlight(colour, albedo, input.WorldPos);
    colour = lerp(colour, FogColour, input.Fog);

    return float4(colour, texel.a);
}

technique Terrain
{
    pass P0
    {
        VertexShader = compile vs_3_0 VertexShaderCommon();
        PixelShader  = compile ps_3_0 PixelShaderTerrain();
    }
}

technique Water
{
    pass P0
    {
        VertexShader = compile vs_3_0 VertexShaderCommon();
        PixelShader  = compile ps_3_0 PixelShaderWater();
    }
}
