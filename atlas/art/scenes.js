/* atlas/art/scenes.js — the pictures in the Portal Atlas, as code.

   Every image on the page is rendered from this file: one raymarched fragment
   shader, a sea that goes to the horizon, and a monument standing in it. The
   opening is the portal itself; each project gets a sculpture of its own, made
   from what the project does (a ledger of slabs for Tally, a door of light for
   Front Desk, a balance on a bell curve for Evals), lit by its region's sky.

   The scenes are expensive to draw, far too expensive to draw live at the
   resolution a large screen deserves, so they are not drawn live. render.mjs
   renders each one offline at full size with supersampling and saves it as
   WebP, and the page shows those files. Change a scene here, run

     node atlas/art/render.mjs [id ...]

   and commit the images. Units: one is about ten metres; the sea is y = 0. */

/* ── the skies: one per region, and the portal's two worlds ──────────────── */

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
};
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

/* zen/hor: sky at the top and at the horizon; sun: direction and colour (the
   moon, at night); stone: the monuments' albedo; fog: density per unit */
export const SKIES = {
  /* first light: pale peach horizon, the sun low behind the work */
  products: { zen: [0.05, 0.085, 0.2], hor: [0.85, 0.6, 0.46], sun: norm([-0.78, 0.13, -0.42]), sunCol: [2.4, 1.5, 0.95],
    disc: 1, stone: [0.62, 0.57, 0.52], water: [0.01, 0.018, 0.032], fog: 0.006, stars: 0, clouds: 0.5, expo: 1.0 },
  /* a clear night, a low moon, stars */
  models: { zen: [0.004, 0.007, 0.02], hor: [0.05, 0.07, 0.13], sun: norm([0.45, 0.16, -0.88]), sunCol: [0.55, 0.66, 0.95],
    disc: 0.5, stone: [0.52, 0.54, 0.6], water: [0.004, 0.007, 0.014], fog: 0.008, stars: 1, clouds: 0.15, expo: 1.35 },
  /* sea fog, and one light in it */
  stories: { zen: [0.08, 0.095, 0.115], hor: [0.21, 0.235, 0.26], sun: norm([0.3, 0.5, -0.8]), sunCol: [0.32, 0.34, 0.37],
    disc: 0, stone: [0.24, 0.24, 0.26], water: [0.01, 0.012, 0.016], fog: 0.06, stars: 0, clouds: 0, expo: 1.25 },
  /* dusk: rose horizon, the sun going */
  games: { zen: [0.06, 0.045, 0.14], hor: [0.95, 0.42, 0.42], sun: norm([0.42, 0.05, -0.9]), sunCol: [2.4, 1.0, 0.6],
    disc: 1, stone: [0.62, 0.55, 0.6], water: [0.012, 0.012, 0.03], fog: 0.014, stars: 0, clouds: 0.6, expo: 1.0 },
  /* late afternoon, high sun, long shadows */
  workshop: { zen: [0.16, 0.27, 0.5], hor: [0.9, 0.78, 0.6], sun: norm([0.75, 0.38, 0.2]), sunCol: [2.1, 1.65, 1.15],
    disc: 0, stone: [0.7, 0.66, 0.6], water: [0.015, 0.03, 0.045], fog: 0.01, stars: 0, clouds: 0.35, expo: 0.95 },
  /* overcast, sea-green, cold and exact */
  engines: { zen: [0.085, 0.14, 0.16], hor: [0.42, 0.52, 0.52], sun: norm([-0.35, 0.6, -0.7]), sunCol: [0.95, 1.05, 1.05],
    disc: 0, stone: [0.5, 0.54, 0.54], water: [0.01, 0.022, 0.026], fog: 0.022, stars: 0, clouds: 0.7, expo: 1.05 },
  /* the opening: blue hour this side of the ring... */
  portal: { zen: [0.012, 0.022, 0.05], hor: [0.17, 0.2, 0.28], sun: norm([0.6, 0.12, 0.79]), sunCol: [0.28, 0.32, 0.42],
    disc: 0, stone: [0.08, 0.08, 0.09], water: [0.004, 0.006, 0.012], fog: 0.0065, stars: 0.5, clouds: 0.25, expo: 1.15 },
};
/* ...and a summer evening on the other side */
const BEYOND = { zen: [0.02, 0.012, 0.05], hor: [0.5, 0.13, 0.04], sunCol: [2.6, 0.95, 0.3] };

/* ── the shader ──────────────────────────────────────────────────────────── */

const COMMON = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform int uSS;
uniform vec3 uZen, uHor, uSun, uSunCol, uWater, uStone, uAccent;
uniform float uFog, uStars, uClouds, uExpo, uDisc;
uniform vec3 uCam, uLook;
uniform float uFov;
uniform vec3 uBoundC, uBoundH;
uniform vec4 uGlow;          /* a point light: position, strength */
uniform vec4 uBeamA;        /* a shaft of light through the air: one end, and its strength */
uniform vec3 uBeamB;        /* the other end */
uniform vec4 uRipple;        /* rings on the water: centre x, z, strength, spacing */
uniform vec4 uPortal;        /* the ring's opening: centre, radius (0 when there is none) */
uniform vec3 uAltZen, uAltHor, uAltSun, uAltSunCol;
out vec4 outCol;

#define STONE 1.
#define DARK 2.
#define GLOW 3.
#define METAL 4.
#define SHADE 5.
#define PAINT 7.

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h13(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
float fbm3(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 3; i++) { s += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
float vn3(vec3 p) { vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3. - 2. * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), u.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), u.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), u.x), u.y), u.z); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float sdRBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }
float sdSph(vec3 p, float r) { return length(p) - r; }
float sdCylY(vec3 p, float r, float h) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdTorZ(vec3 p, vec2 t) { vec2 q = vec2(length(p.xy) - t.x, p.z); return length(q) - t.y; }
float sdTorY(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
/* a ring standing up, facing z, with a squared section (w across, d deep) */
float sdRingZ(vec3 p, float R, float w, float d, float r) { vec2 q = vec2(length(p.xy) - R, p.z); vec2 e = abs(q) - vec2(w, d) + r; return length(max(e, 0.)) + min(max(e.x, e.y), 0.) - r; }
/* a ring lying flat */
float sdRingY(vec3 p, float R, float w, float h) { vec2 q = vec2(length(p.xz) - R, p.y); vec2 e = abs(q) - vec2(w, h); return length(max(e, 0.)) + min(max(e.x, e.y), 0.); }
/* a plate from a to b in the xy plane, th thick, dz deep */
float sdPlate(vec3 p, vec2 a, vec2 b, float th, float dz) { vec2 c = (a + b) * .5, d = normalize(b - a), q = p.xy - c;
  return sdBox(vec3(dot(q, d), dot(q, vec2(-d.y, d.x)), p.z), vec3(length(b - a) * .5, th, dz)) - .012; }
float sdCone(vec3 p, float r, float h) { vec2 q = vec2(length(p.xz), p.y); vec2 k = normalize(vec2(h, r)); return max(dot(q, k) - r * k.x, -p.y); }
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
vec2 U(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

vec2 scene(vec3 p);

/* ── tracing ── */
vec2 boxHit(vec3 ro, vec3 rd) {
  vec3 m = 1. / rd, n = m * (ro - uBoundC), k = abs(m) * uBoundH;
  vec3 t1 = -n - k, t2 = -n + k;
  return vec2(max(max(t1.x, t1.y), t1.z), min(min(t2.x, t2.y), t2.z));
}
float march(vec3 ro, vec3 rd, out float m) {
  m = 0.;
  vec2 b = boxHit(ro, rd);
  if (b.x > b.y || b.y < 0.) return 1e9;
  float t = max(b.x, 0.001);
  for (int i = 0; i < 260; i++) {
    vec2 h = scene(ro + rd * t);
    if (h.x < 0.00025 * (1. + t)) { m = h.y; return t; }
    t += h.x * .85;
    if (t > b.y) break;
  }
  return 1e9;
}
vec3 nrm(vec3 p) { const vec2 e = vec2(1, -1) * .0012;
  return normalize(e.xyy * scene(p + e.xyy).x + e.yyx * scene(p + e.yyx).x + e.yxy * scene(p + e.yxy).x + e.xxx * scene(p + e.xxx).x); }
float soft(vec3 ro, vec3 rd) {
  vec2 b = boxHit(ro, rd);
  if (b.x > b.y || b.y < 0.) return 1.;
  float r = 1., t = max(b.x, .01);
  for (int i = 0; i < 90; i++) {
    float h = scene(ro + rd * t).x;
    r = min(r, 10. * h / t);
    t += clamp(h, .01, .4);
    if (r < .002 || t > b.y) break;
  }
  return clamp(r, 0., 1.);
}
float occl(vec3 p, vec3 n) { float o = 0., s = 1.; for (int i = 1; i < 6; i++) { float h = .04 * float(i * i); o += (h - scene(p + n * h).x) * s; s *= .62; } return clamp(1. - 1.6 * o, 0., 1.); }

/* ── the sky ── */
vec3 sky(vec3 rd, bool alt) {
  vec3 zen = alt ? uAltZen : uZen, hor = alt ? uAltHor : uHor, sc = alt ? uAltSunCol : uSunCol, sd = alt ? uAltSun : uSun;
  float y = max(rd.y, 0.);
  vec3 c = mix(hor, zen, pow(smoothstep(0., alt ? .17 : .42, y), alt ? .62 : .58));
  float s = max(dot(rd, sd), 0.);
  float disc = alt ? 1. : uDisc;
  c += sc * (smoothstep(.99995, .99998, s) * 7. * disc + pow(s, 90.) * .5 + pow(s, 8.) * .22);
  c += mix(hor, sc, .35) * .16 * exp(-y * 22.);
  if (uClouds > 0. && rd.y > 0.) {
    vec2 cp = rd.xz / (rd.y + .06);
    float cl = smoothstep(.5, .86, fbm(cp * vec2(.22, 1.1) + 3.1));
    vec3 cc = mix(hor * 1.05, sc * .55 + hor * .4, pow(s, 3.)) ;
    c = mix(c, cc, cl * uClouds * smoothstep(.0, .12, y) * (alt ? .4 : 1.) * .55);
  }
  if (uStars > 0. && !alt && rd.y > 0.) {
    vec2 sp = vec2(atan(rd.z, rd.x), asin(rd.y)) * 520.;
    vec2 ci = floor(sp), cf = fract(sp) - .5;
    float h = h12(ci);
    if (h > .987) c += vec3(.75, .8, 1.) * smoothstep(.3, .0, length(cf)) * (h - .987) * 90. * uStars * smoothstep(.02, .25, y);
  }
  return c;
}
vec3 fogCol(vec3 rd, bool alt) {
  vec3 hor = alt ? uAltHor : uHor, sc = alt ? uAltSunCol : uSunCol, sd = alt ? uAltSun : uSun;
  return mix(hor, sc * .7, pow(max(dot(rd, sd), 0.), 6.) * .45);
}
vec3 fog(vec3 c, vec3 rd, float t, bool alt) { return mix(c, fogCol(rd, alt), 1. - exp(-t * uFog)); }

/* has the ray gone through the ring before reaching distance t? */
bool through(vec3 ro, vec3 rd, float t) {
  if (uPortal.w <= 0.) return false;
  float tc = (uPortal.z - ro.z) / rd.z;
  if (tc <= 0. || tc >= t) return false;
  vec3 q = ro + rd * tc;
  return length(q.xy - uPortal.xy) < uPortal.w;
}

/* what lies in a direction, for mirrored surfaces: the sky, or the sea under it */
vec3 env(vec3 r) { return r.y > 0. ? sky(r, false) : mix(uWater * 2., sky(vec3(r.x, -r.y, r.z), false), .55); }

vec3 albedo(float m) {
  if (m < 1.5) return uStone;
  if (m < 2.5) return vec3(.03, .032, .038);
  if (m < 3.5) return uAccent;
  if (m < 4.5) return vec3(.9);
  if (m < 5.5) return uStone * .45 + .01;
  if (m > 6.95) return uAccent * .72;
  /* 6.xx: a colour round the wheel, for swatches */
  float hu = fract(m) * 6.2832;
  return clamp(vec3(.55) + .42 * cos(hu + vec3(0., 2.1, 4.2)), 0., 1.) * .8;
}

vec3 light(vec3 p, vec3 rd, float m) {
  vec3 n = nrm(p);
  vec3 a = albedo(m);
  if (m > 2.5 && m < 3.5) return uAccent * 2.6;
  float dif = max(dot(n, uSun), 0.);
  float sh = dif > 0. ? soft(p + n * .004, uSun) : 0.;
  float oc = occl(p, n);
  vec3 amb = mix(uHor, uZen, .5 + .5 * n.y) * (.6 + .4 * n.y);
  /* the sea throws the sky back up under everything */
  vec3 bounce = mix(uHor, uSunCol * .3, .3) * .22 * clamp(.5 - .5 * n.y, 0., 1.) * exp(-p.y * .8);
  vec3 c = a * (uSunCol * dif * sh * 2.2 + amb * oc * .95 + bounce * oc);
  vec3 h = normalize(uSun - rd);
  float fr = .04 + .96 * pow(1. - max(dot(n, -rd), 0.), 5.);
  if (m > 1.5 && m < 2.5) {
    c += uSunCol * pow(max(dot(n, h), 0.), 160.) * sh * 2.;
    c += env(reflect(rd, n)) * fr * .9 * oc;
  } else if (m > 3.5 && m < 4.5) {
    c = env(reflect(rd, n)) * (.55 + .45 * fr) * mix(vec3(1), uAccent, .12) * (.5 + .5 * oc);
    c += uSunCol * pow(max(dot(n, h), 0.), 400.) * sh * 6.;
  } else {
    c += uSunCol * pow(max(dot(n, h), 0.), 24.) * sh * .07;
    c += env(reflect(rd, n)) * fr * .08 * oc;
  }
  if (uGlow.w > 0.) {
    vec3 L = uGlow.xyz - p; float d = length(L);
    c += a * uAccent * uGlow.w * max(dot(n, L / d), 0.) / (1. + d * d * 2.);
  }
  /* the ring's bore is lit by the world on the other side */
  if (uPortal.w > 0.) {
    vec3 L = normalize(vec3(uPortal.xy, uPortal.z - 30.) - p);
    float inner = smoothstep(uPortal.w * 1.25, uPortal.w * .98, length(p.xy - uPortal.xy));
    c += uAltSunCol * .55 * pow(max(dot(n, L), 0.), 2.) * inner * a.r * 8.;
  }
  return c;
}

/* closest approach of a ray to a segment, for shafts of light in the air */
float segDist(vec3 ro, vec3 rd, vec3 a, vec3 b) {
  vec3 ba = b - a, oa = ro - a;
  float bb = dot(ba, ba), rb = dot(rd, ba), ro2 = dot(rd, oa), bo = dot(ba, oa);
  float den = bb - rb * rb;
  float s = clamp((bo - rb * ro2) / max(den, 1e-5), 0., 1.);
  float t = max(dot(a + ba * s - ro, rd), 0.);
  return length(ro + rd * t - (a + ba * s));
}
vec3 air(vec3 ro, vec3 rd, float t) {
  vec3 c = vec3(0);
  if (uGlow.w > 0.) {
    vec3 oc = uGlow.xyz - ro; float tc = dot(oc, rd);
    if (tc > 0. && tc < t + 1.) { float d = length(oc - rd * tc); c += uAccent * uGlow.w * (.02 / (d * d + .02)) * .09; }
  }
  if (uBeamA.w > 0.) { float d = segDist(ro, rd, uBeamA.xyz, uBeamB.xyz); c += uAccent * uBeamA.w * (exp(-d * d * 60.) * .9 + exp(-d * 3.) * .06); }
  return c;
}

vec3 waterN(vec2 p, float t, bool alt) {
  /* calm this side; on the far side of the ring a breeze, so the sun lays a path */
  float a = alt ? .07 : .09 / (1. + t * .12);
  vec2 s = alt ? vec2(.7, 2.6) : vec2(.24, .95);
  float e = .03 + t * .002;
  float h0 = fbm3(p * s), hx = fbm3((p + vec2(e, 0)) * s), hz = fbm3((p + vec2(0, e)) * s);
  vec3 n = normalize(vec3(-(hx - h0) / e * a * .05, 1., -(hz - h0) / e * a * .05));
  if (uRipple.z > 0.) {
    vec2 d = p - uRipple.xy; float r = length(d);
    float w = sin(r / uRipple.w * 6.2832) * exp(-r * .35) * uRipple.z;
    n = normalize(n + vec3(d / max(r, .001) * w * .08, 0.).xzy);
  }
  return n;
}

vec3 render(vec3 ro, vec3 rd) {
  float m;
  float t = march(ro, rd, m);
  float tw = rd.y < 0. ? -ro.y / rd.y : 1e9;
  bool alt = through(ro, rd, min(t, tw));
  vec3 col;
  if (m > 0. && t < tw) {
    col = fog(light(ro + rd * t, rd, m), rd, t, alt);
  } else if (tw < 1e8) {
    vec3 p = ro + rd * tw;
    vec3 n = waterN(p.xz, tw, alt);
    vec3 r = reflect(rd, n); r.y = abs(r.y);
    float fr = .02 + .98 * pow(1. - max(dot(-rd, n), 0.), 5.);
    float m2; float t2 = march(p + vec3(0, .002, 0), r, m2);
    bool alt2 = alt || through(p, r, t2);
    vec3 rc = m2 > 0. ? fog(light(p + r * t2, r, m2), r, t2, alt2) + air(p, r, t2) : sky(r, alt2);
    vec3 deep = uWater * (1. + .8 * (alt ? uAltHor : uHor));
    col = mix(deep, rc, clamp(fr, 0., 1.));
    col = fog(col, rd, tw, alt);
  } else {
    col = sky(rd, alt);
  }
  col += air(ro, rd, min(t, tw));
  return col;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

void main() {
  vec3 fw = normalize(uLook - uCam), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
  vec3 acc = vec3(0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    if (i >= uSS || j >= uSS) continue;
    vec2 o = (vec2(i, j) + .5) / float(uSS) - .5;
    o = rot(.4636) * o;
    vec2 uv = (gl_FragCoord.xy + o - .5 * uRes) / uRes.y;
    vec3 rd = normalize(fw + (uv.x * rt + uv.y * up) * uFov);
    acc += render(uCam, rd);
  }
  vec3 c = acc / float(uSS * uSS);
  c = aces(c * uExpo);
  c = pow(c, vec3(1. / 2.2));
  vec2 q = gl_FragCoord.xy / uRes;
  c *= .86 + .14 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .22);
  c += (h12(gl_FragCoord.xy + 17.) - .5) / 255. * 2.;
  outCol = vec4(c, 1);
}
`;

/* ── the monuments ───────────────────────────────────────────────────────
   Each is a scene body (GLSL returning distance and material), where to stand,
   and what to light. Monuments stand at the origin; the camera puts them a
   little right of centre, the same way every time, so the gallery reads as one
   series. */

const DEF = { cam: [-1.1, 0.42, 10.5], look: [-1.35, 1.55, 0], fov: 0.62, bound: [0, 2, 0, 4, 4.2, 4] };

export const FORMS = {
  /* a ledger of slabs, and one invoice pulled out of it */
  tally: { alt: 'A ledger of slabs, and one invoice pulled out of it.', body: `
    vec2 r = vec2(1e9, 0);
    for (int i = 0; i < 10; i++) { float f = float(i);
      vec3 q = p - vec3(0, .13 + f * .26, 0); q.xz *= rot(f * .07 - .32);
      r = U(r, vec2(sdRBox(q, vec3(1.3, .11, .9), .015), STONE)); }
    vec3 q = p - vec3(.55, .13 + 6.5 * .26, .25); q.xz *= rot(.2);
    r = U(r, vec2(sdBox(q, vec3(1.1, .006, .72)), GLOW));
    return r;`, glow: [0.6, 1.9, 0.6, 0.5] },

  /* a door of light under a listening mast */
  frontdesk: { alt: 'A door of light under a listening mast.', body: `
    vec2 r = vec2(sdBox(p - vec3(-1., 1.6, 0), vec3(.28, 1.6, .35)), STONE);
    r = U(r, vec2(sdBox(p - vec3(1., 1.6, 0), vec3(.28, 1.6, .35)), STONE));
    r = U(r, vec2(sdBox(p - vec3(0, 3.38, 0), vec3(1.42, .2, .4)), STONE));
    r = U(r, vec2(sdBox(p - vec3(0, 1.6, -.22), vec3(.73, 1.6, .02)), GLOW));
    r = U(r, vec2(sdCylY(p - vec3(2.2, 2.4, -1.2), .035, 2.4), DARK));
    r = U(r, vec2(sdSph(p - vec3(2.2, 4.85, -1.2), .09), GLOW));
    return r;`, glow: [0, 1.4, 0.4, 1.4], bound: [0.4, 2.5, -0.5, 3, 2.6, 2] },

  /* an open book, and the one quoted line rising out of it */
  handbook: { alt: 'An open book, and the one quoted line rising out of it.', body: `
    vec3 q = vec3(abs(p.x), p.y, p.z);
    q.yz *= rot(-.16);
    q.xz *= rot(-.62);
    vec2 r = vec2(sdRBox(q - vec3(1.02, 1.45, 0), vec3(1.0, 1.35, .045), .02), STONE);
    vec3 l = q - vec3(1.0, 1.45, .07); l.xz *= rot(.12);
    r = U(r, vec2(sdRBox(l, vec3(.94, 1.3, .012), .006), SHADE));
    r = U(r, vec2(sdRBox(p - vec3(0, 1.45, -.06), vec3(.07, 1.38, .07), .02), SHADE));
    return r;`, beam: [0, 2.9, -0.1, 1.2, 0, 14, -1.2], glow: [0, 2.6, 0.6, 0.5], bound: [0, 1.5, 0, 2.3, 1.6, 1.4] },

  /* an amphitheatre of half rings round a mast */
  callcoach: { alt: 'An amphitheatre of half rings round a mast.', body: `
    vec2 r = vec2(1e9, 0);
    for (int i = 0; i < 4; i++) { float f = float(i);
      float d = sdRingY(p - vec3(0, .12 + f * .14, 0), 1.0 + f * .62, .14, .12 + f * .14);
      r = U(r, vec2(max(d, p.z - .1), STONE)); }
    r = U(r, vec2(sdCylY(p - vec3(0, 1.9, 0), .05, 1.9), DARK));
    r = U(r, vec2(sdSph(p - vec3(0, 3.9, 0), .14), GLOW));
    return r;`, glow: [0, 3.9, 0, 1.2], cam: [-1.2, 3.2, 9.2], look: [-1.3, 1.0, 0] },

  /* three monoliths, and the beam that reads them */
  claims: { alt: 'Three monoliths, and the beam that reads them.', body: `
    vec2 r = vec2(sdRBox(p - vec3(-1.25, 1.7, 0), vec3(.42, 1.7, .32), .02), STONE);
    r = U(r, vec2(sdRBox(p - vec3(0, 2.0, 0), vec3(.42, 2.0, .32), .02), STONE));
    r = U(r, vec2(sdRBox(p - vec3(1.25, 1.5, 0), vec3(.42, 1.5, .32), .02), STONE));
    r = U(r, vec2(sdBox(p - vec3(0, 2.0, .33), vec3(.03, 1.6, .01)), GLOW));
    return r;`, beam: [-3.2, 2.3, 0.5, 0.8, 3.2, 2.3, 0.5], glow: [0, 2.0, 0.6, 0.6] },
  /* a floor plan floating mid-service, one table lit */
  covers: { alt: 'A floor plan floating mid-service, one table lit.', body: `
    vec2 r = vec2(sdRBox(p - vec3(0, .07, 0), vec3(2.7, .07, 1.9), .03), STONE);
    for (int i = 0; i < 9; i++) { float f = float(i);
      vec2 c = vec2(mod(f, 3.) - 1., floor(f / 3.) - 1.) * vec2(1.6, 1.1) + vec2(sin(f * 7.1) * .18, cos(f * 3.3) * .12);
      float t = mod(f, 2.) < .5 ? sdCylY(p - vec3(c.x, .3, c.y), .27, .16) : sdRBox(p - vec3(c.x, .3, c.y), vec3(.42, .16, .26), .02);
      r = U(r, vec2(t, i == 4 ? PAINT : SHADE)); }
    r = U(r, vec2(sdSph(p - vec3(0, .58, 0), .06), GLOW));
    return r;`, glow: [0, 0.75, 0, 0.9], cam: [-1.0, 3.6, 8.6], look: [-1.25, 0.25, 0], bound: [0, 0.6, 0, 3, 0.7, 2.2] },

  /* tokens, and the arcs one attention head learns to draw between them */
  attention: { alt: 'Tokens, and the arcs one attention head learns to draw between them.', body: `
    vec2 r = vec2(1e9, 0);
    for (int i = 0; i < 7; i++) r = U(r, vec2(sdSph(p - vec3(-2.4 + float(i) * .8, 1.1, 0), .2), STONE));
    vec3 q = p - vec3(-1.2, 1.1, 0);  r = U(r, vec2(max(sdTorZ(q, vec2(1.2, .014)), -q.y), GLOW));
    q = p - vec3(-.4, 1.1, 0);        r = U(r, vec2(max(sdTorZ(q, vec2(1.2, .014)), -q.y), GLOW));
    q = p - vec3(.8, 1.1, 0);         r = U(r, vec2(max(sdTorZ(q, vec2(.8, .014)), -q.y), GLOW));
    q = p - vec3(.0, 1.1, 0);         r = U(r, vec2(max(sdTorZ(q, vec2(2.4, .01)), -q.y), GLOW));
    return r;`, glow: [0, 2.2, 0.3, 0.5], bound: [0, 2.2, 0, 3, 1.4, 0.5] },

  /* a word split along the seams a tokeniser sees */
  tokens: { alt: 'A word split along the seams a tokeniser sees.', body: `
    vec3 q = p - vec3(0, 1.0, 0);
    vec2 r = vec2(sdRBox(q - vec3(-.5, 0, -.5), vec3(.45, .95, .45), .012), STONE);
    r = U(r, vec2(sdRBox(q - vec3(.5, .06, -.52), vec3(.45, .95, .45), .012), STONE));
    r = U(r, vec2(sdRBox(q - vec3(-.53, -.04, .5), vec3(.45, .95, .45), .012), STONE));
    vec3 k = q - vec3(.66, .42, .62); k.xy *= rot(.22); k.yz *= rot(-.14);
    r = U(r, vec2(sdRBox(k, vec3(.45, .95, .45), .012), STONE));
    r = U(r, vec2(sdBox(q - vec3(0, -.02, -.5), vec3(.012, .9, .45)), GLOW));
    return r;`, glow: [0, 1.2, 0.2, 0.6], bound: [0.1, 1.2, 0.1, 1.6, 1.4, 1.6] },

  /* a balance on a hill shaped like a bell curve */
  evals: { alt: 'A balance on a hill shaped like a bell curve.', body: `
    float hill = (p.y - (1.0 * exp(-dot(p.xz, p.xz) * .3) - .06)) * .55;
    vec2 r = vec2(hill, SHADE);
    r = U(r, vec2(sdCone(p - vec3(0, .9, 0), .3, .95), STONE));
    vec3 q = p - vec3(0, 1.86, 0); q.xy *= rot(.1);
    r = U(r, vec2(sdRBox(q, vec3(2.0, .035, .07), .02), STONE));
    r = U(r, vec2(sdSph(q - vec3(-1.82, .4, 0), .37), STONE));
    r = U(r, vec2(sdSph(q - vec3(1.82, .31, 0), .28), PAINT));
    return r;`, bound: [0, 1.5, 0, 4.6, 1.6, 4.6] },

  /* the agent's loop, its stations, and the agent on it */
  agents: { alt: 'The agent’s loop, its stations, and the agent on it.', body: `
    vec2 r = vec2(sdRingY(p - vec3(0, .04, 0), 2.1, .045, .04), DARK);
    for (int i = 0; i < 8; i++) { float a = float(i) * .7854, h = .4 + .28 * mod(float(i), 2.);
      vec2 c = vec2(cos(a), sin(a)) * 2.1;
      r = U(r, vec2(sdRBox(p - vec3(c.x, h, c.y), vec3(.17, h, .17), .015), STONE)); }
    r = U(r, vec2(sdSph(p - vec3(cos(1.95) * 2.1, .2, sin(1.95) * 2.1), .16), GLOW));
    return r;`, glow: [Math.cos(1.95) * 2.1, 0.45, Math.sin(1.95) * 2.1, 1.0], cam: [-1.2, 2.9, 9.4], look: [-1.3, 0.45, 0], bound: [0, 0.8, 0, 2.5, 0.9, 2.5] },

  /* a lighthouse on its rock, the beam still turning */
  lamplighter: { alt: 'A lighthouse on its rock, the beam still turning.', body: `
    float rock = (sdSph(p - vec3(0, -.7, 0), 1.45) + (vn3(p * 2.1) - .5) * .4) * .7;
    vec2 r = vec2(rock, SHADE);
    r = U(r, vec2(max(sdCone(p - vec3(0, .3, 0), .44, 4.2), p.y - 2.95), STONE));
    r = U(r, vec2(sdCylY(p - vec3(0, 3.12, 0), .2, .17), GLOW));
    r = U(r, vec2(sdCone(p - vec3(0, 3.29, 0), .27, .32), DARK));
    return r;`, glow: [0, 3.12, 0, 2.6], beam: [0, 3.12, 0, 0.8, -11, 3.5, -6], bound: [0, 1.6, 0, 1.8, 2.2, 1.8] },

  /* one locked room, floating, with the light on inside */
  room: { alt: 'One locked room, floating, with the light on inside.', body: `
    vec3 q = p - vec3(0, 1.55, 0); q.xz *= rot(.55);
    float box = sdBox(q, vec3(1.0, .9, 1.0));
    float door = sdBox(q - vec3(.25, -.28, 1.0), vec3(.22, .56, .06));
    vec2 r = vec2(max(box, -door), STONE);
    r = U(r, vec2(sdBox(q - vec3(.25, -.28, .95), vec3(.21, .55, .01)), GLOW));
    return r;`, glow: [0.95, 1.25, 0.95, 1.4], bound: [0, 1.6, 0, 1.6, 1.1, 1.6] },

  /* a watch hut in the fog: one window lit, the radio still on */
  nightshift: { alt: 'A watch hut in the fog: one window lit, the radio still on.', body: `
    vec2 r = vec2(sdRBox(p - vec3(0, .1, 0), vec3(1.7, .1, 1.05), .04), SHADE);
    vec3 q = p - vec3(0, .85, 0);
    float hut = sdBox(q, vec3(.8, .65, .6));
    float win = sdBox(q - vec3(.32, .05, .6), vec3(.16, .14, .04));
    r = U(r, vec2(max(hut, -win), STONE));
    vec3 rq = q - vec3(0, .65, 0);
    r = U(r, vec2(max(abs(rq.x) * .6 + rq.y * .8 - .5, max(-rq.y, abs(rq.z) - .7)), DARK));
    r = U(r, vec2(sdBox(q - vec3(.32, .05, .575), vec3(.15, .13, .01)), GLOW));
    r = U(r, vec2(sdCylY(p - vec3(-1.25, 1.8, -.45), .022, 1.8), DARK));
    return r;`, glow: [0.32, 0.9, 1.1, 1.3], bound: [0, 1.8, 0, 1.8, 1.9, 1.2] },

  /* a dark rock with one beacon still burning, and embers that do not come down */
  ember: { alt: 'A dark rock with one beacon still burning, and embers that do not come down.', body: `
    float rock = (sdSph(p - vec3(0, -.5, 0), 1.6) + (vn3(p * 1.6) - .5) * .75 + (vn3(p * 5.) - .5) * .12) * .6;
    vec2 r = vec2(rock, DARK);
    r = U(r, vec2(sdSph(p - vec3(.1, 1.42, 0), .2), GLOW));
    for (int i = 0; i < 11; i++) { float f = float(i);
      r = U(r, vec2(sdSph(p - vec3(sin(f * 3.1) * .8 + .1, 1.9 + f * .3, cos(f * 2.3) * .5), .022 + .02 * fract(f * .37)), GLOW)); }
    return r;`, glow: [0.1, 1.5, 0.2, 3.0], bound: [0, 2.6, 0, 2.2, 2.8, 2.2] },

  /* a paper plane the size of a house */
  ace: { alt: 'A paper plane the size of a house.', body: `
    vec3 q = p - vec3(0, 2.0, 0); q.xz *= rot(-.75); q.yz *= rot(.1);
    vec3 w = vec3(abs(q.x), q.y - abs(q.x) * .2, q.z);
    float wing = max(sdBox(w - vec3(.55, 0, .1), vec3(.55, .006, 1.5)), dot(w.xz, vec2(.939, .344)) - .551);
    float keel = max(sdBox(q - vec3(0, -.22, .1), vec3(.006, .22, 1.5)), (-q.y - .24 + .15 * q.z) / 1.011);
    return vec2(min(wing, keel), STONE);`, bound: [0, 2.0, 0, 1.9, 0.9, 1.9] },

  /* blocks stacked as far as they would go, and the slice that fell */
  stack: { alt: 'Blocks stacked as far as they would go, and the slice that fell.', body: `
    vec2 r = vec2(1e9, 0);
    for (int i = 0; i < 8; i++) { float f = float(i), w = 1.15 - f * .085;
      r = U(r, vec2(sdRBox(p - vec3(sin(f * 1.7) * .1, .22 + f * .44, cos(f * 1.3) * .08), vec3(w, .2, w), .012), STONE)); }
    vec3 k = p - vec3(1.75, 2.3, .5); k.xy *= rot(.62); k.yz *= rot(.28);
    r = U(r, vec2(sdRBox(k, vec3(.3, .2, .82), .012), PAINT));
    return r;`, bound: [0.3, 1.9, 0.1, 2.0, 2.0, 1.6] },

  /* a planet, an orbit, and a ship on a line about to let go */
  tether: { alt: 'A planet, an orbit, and a ship on a line about to let go.', body: `
    vec3 c = vec3(0, 2.3, 0);
    vec2 r = vec2(sdSph(p - c, 1.0), STONE);
    vec3 o = p - c; o.yz *= rot(1.25); o.xy *= rot(.3);
    r = U(r, vec2(sdTorZ(o, vec2(1.85, .008)), GLOW));
    vec3 s = vec3(1.55, 3.25, .5);
    r = U(r, vec2(sdSph(p - s, .09), PAINT));
    r = U(r, vec2(sdCap(p, c + normalize(s - c), s, .006), STONE));
    return r;`, glow: [1.55, 3.25, 0.5, 0.5], bound: [0, 2.4, 0, 2.2, 2.2, 2.2] },

  /* a ring that closes under two players */
  sumo: { alt: 'A ring that closes under two players.', body: `
    vec2 r = vec2(sdCylY(p - vec3(0, .12, 0), 2.4, .12), STONE);
    r = U(r, vec2(sdRingY(p - vec3(0, .3, 0), 2.3, .09, .06), SHADE));
    r = U(r, vec2(sdSph(p - vec3(-.52, .63, .2), .38), DARK));
    r = U(r, vec2(sdSph(p - vec3(.46, .63, -.12), .38), PAINT));
    return r;`, cam: [-1.1, 2.4, 9.2], look: [-1.3, 0.3, 0], bound: [0, 0.6, 0, 2.6, 0.6, 2.6] },

  /* tiles with pipes on them, one lifted to turn */
  tangle: { alt: 'Tiles with pipes on them, one lifted to turn.', body: `
    vec2 r = vec2(1e9, 0);
    for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
      vec2 c = vec2(float(i) - 1., float(j) - 1.) * 1.06;
      bool lift = i == 2 && j == 0;
      vec3 q = p - vec3(c.x, lift ? .55 : .12, c.y);
      if (lift) q.xz *= rot(.42);
      r = U(r, vec2(sdRBox(q, vec3(.5, .1, .5), .03), STONE));
      vec3 w = q - vec3(0, .12, 0); w.xz *= rot(mod(float(i * 3 + j * 2), 4.) * 1.5708);
      r = U(r, vec2(max(sdTorY(w - vec3(.5, 0, .5), vec2(.5, .065)), max(w.x - .5, w.z - .5)), PAINT)); }
    return r;`, cam: [-1.0, 3.4, 8.8], look: [-1.3, 0.2, 0], bound: [0, 0.6, 0, 1.8, 0.7, 1.8] },

  /* a minefield, every square decided by logic, one flag */
  sweeper: { alt: 'A minefield, every square decided by logic, one flag.', body: `
    vec2 id = clamp(floor(p.xz / .56), vec2(-3), vec2(2));
    vec2 l = p.xz - (id + .5) * .56;
    float up = h12(id + 7.) > .38 ? 1. : 0.;
    vec2 r = vec2(sdRBox(vec3(l.x, p.y - (.05 + up * .15), l.y), vec3(.23, .05 + up * .15, .23), .02), up > .5 ? STONE : SHADE);
    r = U(r, vec2(sdSph(p - vec3(.84, .3, -.84), .13), PAINT));
    return r;`, cam: [-1.0, 3.4, 8.8], look: [-1.3, 0.2, 0], bound: [0, 0.4, 0, 1.75, 0.45, 1.75] },

  /* eighty-one columns, every height a digit */
  sudoku: { alt: 'Eighty-one columns, every height a digit.', body: `
    vec2 id = clamp(floor(p.xz / .32 + .5), vec2(-4), vec2(4));
    vec2 l = p.xz - id * .32 - sign(id) * step(1.5, abs(id)) * .0;
    float h = .1 + floor(h12(id + 3.) * 9.) * .07;
    vec2 r = vec2(sdRBox(vec3(l.x, p.y - h, l.y), vec3(.13, h, .13), .012), (id.x == 1. && id.y == -2.) ? PAINT : STONE);
    return r;`, cam: [-1.0, 3.2, 8.4], look: [-1.25, 0.3, 0], bound: [0, 0.7, 0, 1.5, 0.75, 1.5] },

  /* a heap of sand, and the stream still pouring */
  sandbox: { alt: 'A heap of sand, and the stream still pouring.', body: `
    vec2 r = vec2(smin(sdCone(p, 2.0, 1.45), p.y + .02, .25), STONE);
    r = U(r, vec2(sdCylY(p - vec3(0, 3.0, 0), .03, 1.6), STONE));
    r = U(r, vec2(sdRBox(p - vec3(0, 4.7, 0), vec3(.55, .1, .55), .02), DARK));
    return r;`, bound: [0, 2.4, 0, 2.3, 2.5, 2.3] },

  /* liquid metal, risen out of the sea */
  mercury: { alt: 'Liquid metal, risen out of the sea.', body: `
    float d = sdSph(p - vec3(0, .95, 0), 1.05);
    d = smin(d, sdSph(p - vec3(.95, .45, .35), .5), .45);
    d = smin(d, sdSph(p - vec3(-.75, .32, -.3), .42), .4);
    return vec2(d, METAL);`, ripple: [0, 0, 1.2, 0.55], bound: [0, 1.1, 0, 2, 1.2, 1.6] },

  /* a step sequencer, the playing steps lit */
  beats: { alt: 'A step sequencer, the playing steps lit.', body: `
    vec2 r = vec2(1e9, 0);
    for (int i = 0; i < 8; i++) { float f = float(i), h = .25 + .85 * fract(sin(f * 12.9898) * 43758.5);
      r = U(r, vec2(sdCylY(p - vec3(-2.1 + f * .6, h, 0), .24, h), STONE));
      if (mod(f, 3.) < .5 || i == 4) r = U(r, vec2(sdCylY(p - vec3(-2.1 + f * .6, 2. * h + .012, 0), .2, .012), GLOW)); }
    return r;`, glow: [0, 2.6, 0.5, 0.6], bound: [0, 1.2, 0, 2.5, 1.3, 0.4] },

  /* a world made by pressing a button */
  island: { alt: 'A world made by pressing a button.', body: `
    float rr = length(p.xz * vec2(1., 1.35));
    float h = (fbm(p.xz * .85 + 2.) * 1.9 - .45) * smoothstep(2.7, .3, rr) - .15 * smoothstep(1.8, 2.8, rr);
    return vec2(max((p.y - h) * .45, rr - 3.0), STONE);`, bound: [0, 0.8, 0, 3.1, 0.9, 2.4] },

  /* a code you can scan, raised out of the water */
  qr: { alt: 'A code you can scan, raised out of the water.', body: `
    vec2 id = clamp(floor(p.xz / .3), vec2(-5), vec2(4));
    vec2 l = p.xz - (id + .5) * .3;
    vec2 a = abs(id + .5);
    bool finder = (id.x <= -3. && id.y <= -3.) || (id.x >= 2. && id.y <= -3.) || (id.x <= -3. && id.y >= 2.);
    bool on = finder || h12(id + 11.) > .5;
    float h = on ? .16 : .03;
    vec2 r = vec2(sdRBox(vec3(l.x, p.y - h, l.y), vec3(.14, h, .14), .01), on ? STONE : DARK);
    return r;`, cam: [-1.0, 3.3, 8.6], look: [-1.25, 0.25, 0], bound: [0, 0.2, 0, 1.6, 0.25, 1.6] },

  /* a sphere split exactly in two */
  split: { alt: 'A sphere split exactly in two.', body: `
    vec3 q = p - vec3(0, 1.32, 0);
    vec3 a = q + vec3(.16, 0, 0); a.xy *= rot(.08);
    vec3 b = q - vec3(.34, .06, 0); b.xy *= rot(-.24);
    vec2 r = vec2(max(sdSph(a, 1.2), a.x), STONE);
    r = U(r, vec2(max(sdSph(b, 1.2), -b.x), PAINT));
    return r;`, bound: [0, 1.4, 0, 1.8, 1.4, 1.4] },

  /* a tuning fork, still ringing */
  tuner: { alt: 'A tuning fork, still ringing.', body: `
    float stem = sdCylY(p - vec3(0, .9, 0), .085, .9);
    vec3 b = p - vec3(0, 2.0, 0);
    float bend = max(sdTorZ(b, vec2(.45, .085)), b.y);
    float pr = min(sdCap(p, vec3(-.45, 2.0, 0), vec3(-.45, 4.3, 0), .085), sdCap(p, vec3(.45, 2.0, 0), vec3(.45, 4.3, 0), .085));
    return vec2(min(min(stem, bend), pr), METAL);`, ripple: [0, 0, 1.5, 0.45], bound: [0, 2.2, 0, 0.7, 2.3, 0.3] },

  /* a funnel that lets only some of it through */
  sift: { alt: 'A funnel that lets only some of it through.', body: `
    vec3 q = p - vec3(0, 2.25, 0);
    float f = max((abs(length(q.xz) - (.12 + q.y * .78)) - .03) * .75, abs(q.y - .75) - .75);
    vec2 r = vec2(f, STONE);
    for (int i = 0; i < 6; i++) r = U(r, vec2(sdSph(p - vec3(0, 2.05 - float(i) * .36, 0), .065), PAINT));
    for (int i = 0; i < 7; i++) { float k = float(i); r = U(r, vec2(sdSph(p - vec3(sin(k * 2.4) * .7, 3.3 + fract(k * .41) * .4, cos(k * 2.4) * .5), .11), SHADE)); }
    return r;`, bound: [0, 2.0, 0, 1.6, 2.0, 1.6] },

  /* a pattern compiled into a machine of states */
  'regex-lab': { alt: 'A pattern compiled into a machine of states.', body: `
    vec2 r = vec2(1e9, 0);
    for (int i = 0; i < 5; i++) { float x = -2. + float(i);
      r = U(r, vec2(sdSph(p - vec3(x, 1.1, 0), .22), STONE));
      if (i < 4) r = U(r, vec2(sdCap(p, vec3(x + .22, 1.1, 0), vec3(x + .78, 1.1, 0), .022), DARK)); }
    r = U(r, vec2(sdTorZ(p - vec3(2, 1.1, 0), vec2(.33, .018)), GLOW));
    r = U(r, vec2(sdTorZ(p - vec3(0, 1.55, 0), vec2(.24, .016)), GLOW));
    return r;`, glow: [2, 1.1, 0.4, 0.5], bound: [0, 1.2, 0, 2.5, 0.8, 0.5] },

  /* a plan: the question at the top, the tables at the bottom */
  'query-planner': { alt: 'A plan: the question at the top, the tables at the bottom.', body: `
    vec2 r = vec2(sdRBox(p - vec3(0, 3.1, 0), vec3(.45, .25, .45), .02), PAINT);
    r = U(r, vec2(sdRBox(p - vec3(-1.2, 1.95, 0), vec3(.38, .22, .38), .02), STONE));
    r = U(r, vec2(sdRBox(p - vec3(1.2, 1.95, 0), vec3(.38, .22, .38), .02), STONE));
    for (int i = 0; i < 4; i++) { float x = -1.8 + float(i) * 1.2;
      r = U(r, vec2(sdRBox(p - vec3(x, .4, 0), vec3(.34, .4, .34), .02), STONE));
      r = U(r, vec2(sdCap(p, vec3(x, .8, 0), vec3(x < 0. ? -1.2 : 1.2, 1.73, 0), .025), DARK)); }
    r = U(r, vec2(sdCap(p, vec3(-1.2, 2.17, 0), vec3(0, 2.85, 0), .025), DARK));
    r = U(r, vec2(sdCap(p, vec3(1.2, 2.17, 0), vec3(0, 2.85, 0), .025), DARK));
    return r;`, bound: [0, 1.8, 0, 2.3, 1.8, 0.5] },

  /* five servers agreeing; the leader a little taller */
  'raft-lab': { alt: 'Five servers agreeing; the leader a little taller.', body: `
    vec2 r = vec2(1e9, 0);
    for (int i = 0; i < 5; i++) { float a = float(i) * 1.2566 + .3, h = i == 0 ? 1.7 : 1.1;
      vec2 c = vec2(cos(a), sin(a)) * 1.9;
      r = U(r, vec2(sdRBox(p - vec3(c.x, h, c.y), vec3(.2, h, .2), .02), STONE));
      if (i > 0) r = U(r, vec2(sdCap(p, vec3(cos(.3) * 1.9, 3.4, sin(.3) * 1.9), vec3(c.x, 2. * h, c.y), .012), GLOW)); }
    r = U(r, vec2(sdSph(p - vec3(cos(.3) * 1.9, 3.55, sin(.3) * 1.9), .13), GLOW));
    return r;`, glow: [Math.cos(0.3) * 1.9, 3.55, Math.sin(0.3) * 1.9, 1.0], cam: [-1.2, 2.0, 9.6], look: [-1.3, 1.0, 0], bound: [0, 1.85, 0, 2.3, 1.9, 2.3] },

  /* where a slow request spent its time, as a flame chart in stone */
  'trace-explorer': { alt: 'Where a slow request spent its time, as a flame chart in stone.', body: `
    vec2 r = vec2(sdRBox(p - vec3(0, .2, 0), vec3(2.3, .19, .45), .02), STONE);
    r = U(r, vec2(sdRBox(p - vec3(-1.25, .62, 0), vec3(1.0, .19, .45), .02), STONE));
    r = U(r, vec2(sdRBox(p - vec3(1.0, .62, 0), vec3(1.25, .19, .45), .02), STONE));
    r = U(r, vec2(sdRBox(p - vec3(-1.6, 1.04, 0), vec3(.5, .19, .45), .02), STONE));
    r = U(r, vec2(sdRBox(p - vec3(.95, 1.04, 0), vec3(1.15, .19, .45), .02), PAINT));
    r = U(r, vec2(sdRBox(p - vec3(.65, 1.46, 0), vec3(.75, .19, .45), .02), STONE));
    r = U(r, vec2(sdRBox(p - vec3(.4, 1.88, 0), vec3(.3, .19, .45), .02), STONE));
    return r;`, bound: [0, 1.1, 0, 2.4, 1.1, 0.5] },

  /* two histories meeting, and the one that leaves */
  'diff-forge': { alt: 'Two histories meeting, and the one that leaves.', body: `
    vec3 a = p - vec3(-1.25, .15, -1.65); a.xz *= rot(-.6);
    vec3 b = p - vec3(1.25, .15, -1.65); b.xz *= rot(.6);
    vec2 r = vec2(sdRBox(a, vec3(.28, .15, 1.6), .02), STONE);
    r = U(r, vec2(sdRBox(b, vec3(.28, .15, 1.6), .02), SHADE));
    r = U(r, vec2(sdRBox(p - vec3(0, .32, 0), vec3(.55, .32, .55), .03), PAINT));
    r = U(r, vec2(sdRBox(p - vec3(0, .15, 1.95), vec3(.28, .15, 1.4), .02), STONE));
    return r;`, cam: [-1.0, 3.0, 9.4], look: [-1.3, 0.2, 0], bound: [0, 0.7, 0, 2.6, 0.8, 3.4] },

  /* a fan of swatches, every one of them passing */
  'oklch-studio': { alt: 'A fan of swatches, every one of them passing.', body: `
    vec2 r = vec2(1e9, 0);
    for (int i = 0; i < 7; i++) { float f = float(i);
      vec3 q = p - vec3(0, .25, 0); q.xy *= rot(.78 - f * .26);
      r = U(r, vec2(sdRBox(q - vec3(0, 1.65, f * .035), vec3(.33, 1.4, .012), .01), 6.03 + f * .105)); }
    r = U(r, vec2(sdSph(p - vec3(0, .25, .12), .09), DARK));
    return r;`, bound: [0, 1.7, 0, 3.0, 1.8, 0.4] },
};

export const SCENES = {
  /* the opening: a ring a quarter of a kilometre across, standing in the sea */
  portal: { alt: 'A ring a quarter of a kilometre across, standing in a calm sea at dusk. Through it, a different evening: gold.', sky: 'portal', accent: '#ffcf9a', body: `
    vec2 r = vec2(sdRingZ(p - vec3(0, 1.2, 0), 11.2, .95, 1.5, .08), DARK);
    /* someone on the water, for scale */
    vec3 f = p - vec3(-3.4, 0, 22.);
    float body = sdCap(f, vec3(0, .02, 0), vec3(0, .13, 0), .028);
    body = min(body, sdSph(f - vec3(0, .17, 0), .024));
    r = U(r, vec2(body, DARK));
    return r;`,
    bound: [0, 1.2, 2, 12.4, 12.6, 22], portal: [0, 1.2, 0, 10.2],
    views: {
      wide: { cam: [-6.2, 0.55, 48], look: [-11.5, 4.4, 0], fov: 0.66 },
      tall: { cam: [0.2, 0.6, 58], look: [0, -5.6, 0], fov: 0.86 },
    } },
};

/* ── putting a picture together ───────────────────────────────────────── */

export function ids() { return [...Object.keys(SCENES), ...Object.keys(FORMS)]; }

/** Everything needed to draw one picture: shader source and uniforms. */
export function picture(id, { region, accent } = {}, view = 'wide') {
  const s = SCENES[id] ?? FORMS[id];
  if (!s) throw new Error(`no scene ${id}`);
  const skyName = s.sky ?? region;
  const sk = SKIES[skyName];
  if (!sk) throw new Error(`no sky for ${id}`);
  const v = { ...DEF, ...s, ...(s.views?.[view] ?? {}) };
  const beam = s.beam ?? null;
  const alt = s.portal ? norm([0, 0.035, -1]) : [0, 1, 0];
  return {
    frag: `${COMMON}\nvec2 scene(vec3 p) {${s.body}\n}\n`,
    u: {
      uZen: sk.zen, uHor: sk.hor, uSun: sk.sun, uSunCol: sk.sunCol, uWater: sk.water, uStone: sk.stone,
      uAccent: hex(s.accent ?? accent ?? '#ffffff'), uFog: sk.fog, uStars: sk.stars, uClouds: sk.clouds, uExpo: sk.expo, uDisc: sk.disc,
      uCam: v.cam, uLook: v.look, uFov: v.fov,
      uBoundC: v.bound.slice(0, 3), uBoundH: v.bound.slice(3, 6),
      uGlow: s.glow ?? [0, 0, 0, 0],
      uBeamA: beam ? [beam[0], beam[1], beam[2], beam[3]] : [0, 0, 0, 0], uBeamB: beam ? beam.slice(4, 7) : [0, 0, 0],
      uRipple: s.ripple ?? [0, 0, 0, 1],
      uPortal: s.portal ?? [0, 0, 0, 0],
      uAltZen: BEYOND.zen, uAltHor: BEYOND.hor, uAltSun: alt, uAltSunCol: BEYOND.sunCol,
    },
  };
}
