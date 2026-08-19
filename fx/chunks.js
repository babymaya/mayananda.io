/* Shared GLSL fragments.
 *
 * Techniques here were learned by reading the react-bits effects
 * (MIT + Commons Clause, (c) 2026 David Haz — https://reactbits.dev).
 * The ordered-dither construction and the antialiased cell masks follow that
 * source closely enough to name it; the rest is standard shader practice.
 *
 * Kept as strings rather than .glsl files so they are bundled, not fetched —
 * a background that needs two round trips before it draws is worse than one
 * that costs a few hundred bytes of JavaScript.
 */

export const HASH = `
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float hash21t(vec2 p, float t) {
  return fract(sin(dot(p + t, vec2(12.9898, 78.233))) * 43758.5453123);
}
`;

/* Recursive 8x8 ordered dither, built from a 2x2 by halving the coordinate.
 * Four lines for a threshold matrix that turns a smooth field into stable
 * clusters of on/off cells — stable being the point: white noise would boil,
 * an ordered matrix holds still while the field moves through it. */
export const BAYER = `
float Bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
#define Bayer4(a) (Bayer2(0.5 * (a)) * 0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(0.5 * (a)) * 0.25 + Bayer2(a))
`;

/* Value noise on three axes, the third being time, so the field evolves
 * without a second sample or a blend between frames. */
export const VNOISE = `
float vnoise(vec3 p) {
  vec3 ip = floor(p), fp = fract(p);
  vec3 k = vec3(1.0, 57.0, 113.0);
  float n000 = hash11(dot(ip + vec3(0,0,0), k));
  float n100 = hash11(dot(ip + vec3(1,0,0), k));
  float n010 = hash11(dot(ip + vec3(0,1,0), k));
  float n110 = hash11(dot(ip + vec3(1,1,0), k));
  float n001 = hash11(dot(ip + vec3(0,0,1), k));
  float n101 = hash11(dot(ip + vec3(1,0,1), k));
  float n011 = hash11(dot(ip + vec3(0,1,1), k));
  float n111 = hash11(dot(ip + vec3(1,1,1), k));
  vec3 w = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
  float x00 = mix(n000, n100, w.x), x10 = mix(n010, n110, w.x);
  float x01 = mix(n001, n101, w.x), x11 = mix(n011, n111, w.x);
  return mix(mix(x00, x10, w.y), mix(x01, x11, w.y), w.z) * 2.0 - 1.0;
}

// Real fBm: amplitude halves each octave. The source this came from left the
// gain at 1.0, which sums every octave at full weight and is much noisier.
float fbm(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return sum;
}
`;

/* Antialiased cell shapes. fwidth gives the screen-space width of one unit of
 * the distance, so the edge stays one pixel wide at any cell size. */
export const SHAPES = `
float maskSquare(vec2 p, float cov) { return cov; }

float maskCircle(vec2 p, float cov) {
  float r = sqrt(cov) * 0.5;
  float d = length(p - 0.5) - r;
  float aa = 0.5 * fwidth(d);
  return cov * (1.0 - smoothstep(-aa, aa, d));
}

float maskDiamond(vec2 p, float cov) {
  float r = sqrt(cov) * 0.62;
  float d = abs(p.x - 0.5) + abs(p.y - 0.5) - r;
  float aa = 0.5 * fwidth(d);
  return cov * (1.0 - smoothstep(-aa, aa, d));
}
`;

/* Cosine palette. Three lines and no uniform array for a full spectrum;
 * phase per channel decides the hue sequence. */
export const PALETTE = `
const float TAU = 6.28318530718;
vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}
`;

/* The exact piecewise transform, not pow(x, 1.0/2.2). The approximation is
 * visibly wrong in the darks, which is most of this site. */
export const SRGB = `
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;
