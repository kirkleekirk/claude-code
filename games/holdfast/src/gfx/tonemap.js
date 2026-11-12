// The film look, shared by the post pipeline's final pass and (on the
// lightest setting, where there is no post pipeline) by every material.
// AgX base curve with a contrast/saturation "look" on top.
export const LOOK = { power: 1.3, sat: 1.3 };

export const TONEMAP_GLSL = /* glsl */`
vec3 hfAgxCurve( vec3 x ) {
	vec3 x2 = x * x, x4 = x2 * x2;
	return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
// scene-referred linear in, display-referred linear out (0..1)
vec3 hfTonemap( vec3 color, float power, float sat ) {
	const mat3 toRec2020 = mat3( vec3( 0.6274, 0.0691, 0.0164 ), vec3( 0.3293, 0.9195, 0.0880 ), vec3( 0.0433, 0.0113, 0.8956 ) );
	const mat3 fromRec2020 = mat3( vec3( 1.6605, - 0.1246, - 0.0182 ), vec3( - 0.5876, 1.1329, - 0.1006 ), vec3( - 0.0728, - 0.0083, 1.1187 ) );
	const mat3 inset = mat3( vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ), vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ), vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
	const mat3 outset = mat3( vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ), vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ), vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 ) );
	color = inset * ( toRec2020 * color );
	color = clamp( ( log2( max( color, 1e-10 ) ) + 12.47393 ) / 16.5, 0.0, 1.0 );
	color = hfAgxCurve( color );
	color = pow( max( color, 0.0 ), vec3( power ) );
	float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = l + sat * ( color - l );
	color = outset * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	return clamp( fromRec2020 * color, 0.0, 1.0 );
}
`;
