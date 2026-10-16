/* atlas/sky.js — the world behind the page, in one fragment shader.

   Two places share this canvas. The threshold: a black sea between cliffs at
   night, a sea stack with a lighthouse, a far city floating in the haze, a ringed
   moon, cloud banks and a broken arch on the horizon, a causeway across the water
   with one person on it, and the ring: a thick tube of stone hung on cables,
   with a dial of thirty-five blocks round it (one for each world). And the world
   beyond it: a floating city above a sea of clouds, which is where the islands
   live, under weather that changes with each region of the atlas.

   Every layer sits at its own distance from the camera, and at() looks a pixel
   up in a layer as the camera moves, so the pointer gives real parallax and
   scrolling is a real camera move: it lines up with the ring's axis, passes its
   face, flies down the lit bore and through the far opening (uTravel). The rest
   of the page's scroll lowers it towards the clouds (uAlt).

   Everything is computed per pixel: no meshes, no image files. The one texture
   is the floating city beyond the ring, drawn once with the 2D canvas (hero.js)
   and uploaded. The sea is the scene drawn a second time, mirrored about the
   water at each layer's own distance and pushed about by moving noise.

   It renders below screen resolution and adjusts that resolution to hold its
   frame rate; off screen, in a background tab or with reduced motion it stops
   drawing. If WebGL is missing or the shader will not compile, createSky
   returns null and the page falls back to the 2D canvas world. */

import { buildCity } from './hero.js';
import { EYE, DIAL_SPEED, sceneLayout, dialAt, dialPoint, toScreen, moonPhase } from './scene.js';

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = (oct, mode) => `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uIntro, uTravel, uHover, uAlt, uMoon, uLamp, uAccentAmt, uFlash;
uniform vec2 uMouse;
uniform vec3 uPortal;      // ring centre x, y and outer radius (scene units: y spans -0.5..0.5)
uniform float uHz;         // horizon height
uniform vec4 uCliff;       // right cliff face x, sea stack x, stack top y, narrow (0/1)
uniform vec3 uMoonA;       // big moon x, y, radius
uniform vec3 uFar;         // far floating city x, y, half-width
uniform vec3 uAccent, uTint;
uniform vec4 uEnvA;        // the world beyond: stars, grid, water, aurora
uniform vec4 uEnvB;        // the world beyond: night, warmth, lamps
uniform vec3 uFocus;       // the island being looked at: x, y, amount
uniform vec2 uSeen;        // dial blocks of worlds already visited, as two bitmasks
uniform float uDialRot, uDialHot;
uniform sampler2D uCity;
uniform float uCityA;      // city texture height / width
#define OCT ${oct}
${mode === 'beyond' ? '#define BEYOND_ONLY' : ''}
#define DEPTH 0.26
#define EYE 0.03
#define NB 35.0
#define TAU 6.2831853
#define PI 3.14159265

/* The camera. gS is how far it has moved towards the ring (the ring's front face
   is at distance 1), gM how far it has moved sideways and up to line up with the
   ring's axis, plus a little for the pointer. Every layer of the scene sits at a
   depth Z and is looked up through at(): near things move more than far things. */
float gS;
vec2 gM;
vec2 gO;

float h21(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { v += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float fbm3(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float A() { return uRes.x / uRes.y; }
float on(float a, float b) { return smoothstep(a, b, uIntro); }
float sat(float x) { return clamp(x, 0.0, 1.0); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
float bit(float mask, float i) { return mod(floor(mask / exp2(i) + 0.001), 2.0); }
vec2 at(vec2 p, float Z) { vec2 V = vec2(0.0, uHz); return V + ((p - V) * (Z - gS) + gM) / Z; }
vec2 Vp() { return vec2(0.0, uHz); }

/* ── the world beyond the portal ─────────────────────────────────────── */

vec4 city(vec2 q, vec2 at0, float h) {
  vec2 uv = vec2((q.x - at0.x) / (h / uCityA) + 0.5, 1.0 - ((q.y - at0.y) / h + 0.5));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uCity, uv);
}

vec3 bsky(vec2 q, float t, vec2 sun, vec3 top, vec3 midc, vec3 hor, float stars, float aurora, float night) {
  vec3 col = mix(hor, midc, smoothstep(0.0, 0.16, t));
  col = mix(col, top, smoothstep(0.12, 0.55, t));
  float sd = length((q - sun) * vec2(1.0, 2.0));
  vec3 sunC = mix(vec3(1.0, 0.8, 0.58), vec3(0.55, 0.62, 0.85), night);
  col += sunC * (0.55 * exp(-sd * 7.0) + 0.25 * exp(-sd * 2.2)) * (1.0 - night * 0.75);
  if (stars > 0.01) {
    vec2 sp = q * 260.0;
    vec2 cell = floor(sp);
    float h = h21(cell);
    if (h > 0.984) {
      vec2 f = fract(sp) - 0.5 - (vec2(h21(cell + 1.3), h21(cell + 2.7)) - 0.5) * 0.6;
      float tw = 0.6 + 0.4 * sin(uTime * (0.7 + h * 3.0) + h * 50.0);
      col += vec3(0.85, 0.9, 1.0) * smoothstep(0.32, 0.0, length(f)) * tw * stars * smoothstep(0.03, 0.3, t);
    }
  }
  if (aurora > 0.01) {
    float ax = q.x * 2.0;
    float y0 = 0.25 + 0.05 * sin(ax * 1.6 + uTime * 0.04) + 0.03 * sin(ax * 3.7 - uTime * 0.03);
    float band = exp(-pow((t - y0) / 0.05, 2.0)) + 0.6 * exp(-pow((t - y0 - 0.08) / 0.04, 2.0));
    float curtain = smoothstep(y0 - 0.02, y0 + 0.06, t) * smoothstep(y0 + 0.32, y0 + 0.04, t);
    float rays = 0.4 + 0.6 * pow(vn(vec2(q.x * 30.0, uTime * 0.12)), 2.0);
    col += (vec3(0.3, 0.95, 0.72) * band + vec3(0.5, 0.36, 0.92) * curtain * 0.35) * rays * aurora * 0.34;
  }
  return col;
}

vec3 beyond(vec2 q, float full) {
  float stars = uEnvA.x * full, grid = uEnvA.y * full, water = uEnvA.z * full, aurora = uEnvA.w * full;
  float night = uEnvB.x * full, warm = uEnvB.y * full, lamps = uEnvB.z * full;
  float hb = mix(-0.11, -0.04 + uAlt * 0.22, full);
  float t = q.y - hb;
  vec3 tint = mix(vec3(1.0), uTint, full);
  vec3 top = mix(vec3(0.035, 0.055, 0.14), vec3(0.006, 0.01, 0.03), night) * tint;
  vec3 midc = mix(vec3(0.17, 0.25, 0.42), vec3(0.035, 0.06, 0.14), night) * tint;
  vec3 hor = mix(vec3(1.0, 0.8, 0.6), vec3(1.0, 0.58, 0.52), warm);
  hor = mix(hor, vec3(0.16, 0.21, 0.36), night) * mix(vec3(1.0), tint, 0.45);
  vec2 sun = vec2(-0.05 + 0.25 * full, hb + 0.045 - warm * 0.025);
  vec3 col;
  if (t > 0.0) {
    col = bsky(q, t, sun, top, midc, hor, stars, aurora, night);
    float sd = length((q - sun) * vec2(1.0, 2.0));
    float ang = atan(q.y - sun.y, q.x - sun.x);
    col += vec3(1.0, 0.85, 0.65) * pow(vn(vec2(ang * 18.0, uTime * 0.05)), 4.0) * exp(-sd * 4.0) * 0.07 * (1.0 - night);
    /* cumulus towers on the horizon, lit on the sun's side */
    float c = fbm3(vec2(q.x * 2.6 + uTime * 0.005, t * 7.5 - 0.3));
    float tower = smoothstep(0.42, 0.56, c - t * 2.2);
    float sunSide = 0.5 + 0.5 * clamp((sun.x - q.x) * -4.0, -1.0, 1.0);
    vec3 towerCol = mix(vec3(0.42, 0.42, 0.6), mix(vec3(1.0, 0.86, 0.72), vec3(1.0, 0.7, 0.62), warm), mix(c, sunSide, 0.4)) * tint;
    towerCol = mix(towerCol, vec3(0.1, 0.12, 0.2) + vec3(0.25, 0.3, 0.45) * c * 0.5, night);
    col = mix(col, towerCol, tower * 0.75);
    vec2 m = q - vec2(0.42 - 0.2 * full, hb + 0.3);
    col += vec3(0.95) * smoothstep(0.02 + night * 0.012, 0.016 + night * 0.012, length(m)) * (0.3 + night * 0.5);
  } else {
    /* the sea of clouds from above: a plane with perspective, lit from the sun's side */
    float k = -t;
    float z = 0.14 / (k + 0.01);
    vec2 w = vec2(q.x * z, z * 0.55 + uTime * 0.025 + uAlt * 2.5);
    vec2 warp = vec2(fbm3(w * 0.35 + 3.1), fbm3(w * 0.35 + 7.7)) - 0.5;
    vec2 ww = w * 1.5 + warp * 1.6;
    float c = full > 0.5 ? fbm(ww) : fbm3(ww);
    vec2 toSun = normalize(vec2(sun.x - q.x, 1.0));
    float c2 = full > 0.5 ? fbm(ww + toSun * 0.12) : fbm3(ww + toSun * 0.12);
    float lightEdge = clamp((c - c2) * 9.0 + 0.45, 0.0, 1.0);
    float dens = smoothstep(0.4, 0.64, c);
    vec3 valley = mix(vec3(0.11, 0.14, 0.27), vec3(0.025, 0.035, 0.08), night) * tint;
    vec3 body = mix(vec3(0.52, 0.52, 0.68), vec3(0.14, 0.17, 0.28), night) * tint;
    vec3 crest = mix(mix(vec3(1.0, 0.86, 0.72), vec3(1.0, 0.72, 0.64), warm), vec3(0.5, 0.56, 0.75), night) * mix(vec3(1.0), tint, 0.35);
    col = mix(valley, body, dens);
    col = mix(col, crest, dens * lightEdge * 0.85);
    float haze = exp(-k * 9.0);
    col = mix(col, hor * 0.92, haze * 0.85);
    col += vec3(1.0, 0.78, 0.55) * 0.22 * exp(-length((q - vec2(sun.x, hb)) * vec2(0.7, 7.0)) * 3.5) * (1.0 - night * 0.8);
    /* the shallows: the cloud thins into still water that holds the sky */
    if (water > 0.01) {
      float rip = (vn(vec2(w.x * 3.0, w.y * 9.0 - uTime * 0.5)) - 0.5) + 0.5 * (vn(vec2(w.x * 9.0, w.y * 26.0 + uTime * 0.4)) - 0.5);
      vec2 rq = vec2(q.x + rip * 0.006 * k * 6.0, hb + k * 1.04);
      vec3 refl = bsky(rq, k * 1.04, sun, top, midc, hor, stars * 0.6, aurora, night);
      refl = mix(refl, refl * vec3(0.7, 0.86, 0.92), 0.5);
      /* the sun laid across the water as a path of glints */
      float path = exp(-pow((q.x - sun.x) / (0.03 + k * 0.5), 2.0));
      float glint = smoothstep(0.7, 0.95, vn(vec2(w.x * 90.0, w.y * 300.0 - uTime * 1.5)));
      refl += vec3(1.0, 0.9, 0.75) * path * glint * 0.6;
      /* long low swells catching the sky */
      float swell = smoothstep(0.55, 0.9, vn(vec2(w.x * 2.0, w.y * 38.0 - uTime * 0.6)));
      refl += vec3(0.75, 0.85, 0.95) * swell * 0.06 * exp(-k * 4.0);
      refl *= mix(0.5, 1.0, exp(-k * 5.0));
      /* rings where something touched the surface */
      vec2 rc = fract(w * 0.35) - 0.5;
      float ring = smoothstep(0.02, 0.0, abs(length(rc * vec2(1.0, 2.6)) - fract(uTime * 0.12 + h21(floor(w * 0.35)) ) * 0.5));
      refl += vec3(0.8, 0.9, 1.0) * ring * 0.08 * smoothstep(0.02, 0.15, k);
      float mist = dens * 0.45 * smoothstep(0.0, 0.25, k);
      col = mix(col, refl, water * (1.0 - mist));
    }
    /* the engine rooms: a drafting grid laid out across the cloud */
    if (grid > 0.01) {
      vec2 g = abs(fract(w * 0.5) - 0.5);
      float lw = 0.008 + 0.003 * z;
      float ln = smoothstep(lw, 0.0, min(g.x, g.y));
      vec2 g2 = abs(fract(w * 2.5) - 0.5);
      float fine = smoothstep(lw * 2.4, 0.0, min(g2.x, g2.y)) * smoothstep(0.08, 0.2, k);
      /* a pulse of light running along the lines towards the horizon */
      float run = smoothstep(0.94, 1.0, fract(w.y * 0.25 - uTime * 0.12 + floor(w.x * 0.5) * 0.37)) * step(0.6, h21(vec2(floor(w.x * 0.5), 4.0)));
      col = mix(col, col * vec3(0.72, 0.84, 0.94), grid * 0.3);
      col += vec3(0.62, 0.9, 0.9) * (ln * (0.28 + 0.7 * run) + fine * 0.08) * grid * smoothstep(0.004, 0.05, k) * (0.6 + 0.4 * dens);
      col += vec3(0.3, 0.8, 0.8) * grid * 0.06 * exp(-k * 18.0);
    }
    /* the night isles: lamps scattered across the cloud */
    if (lamps > 0.01) {
      vec2 lw2 = w * vec2(2.2, 2.2);
      vec2 cell = floor(lw2);
      float h = h21(cell + 17.0);
      if (h > 0.62) {
        vec2 lp = cell + 0.5 + (vec2(h21(cell + 3.1), h21(cell + 5.7)) - 0.5) * 0.6;
        vec2 dv = (lw2 - lp) * vec2(1.0, 0.7);
        float dd = length(dv);
        float flick = 0.78 + 0.22 * sin(uTime * (1.3 + h * 3.0) + h * 30.0);
        /* a lamp, its halo in the mist, and its light thrown down the cloud below it */
        col += vec3(1.0, 0.76, 0.42) * (exp(-dd * 4.0) * 0.32 + exp(-dd * 22.0) * 1.6 + exp(-abs(dv.x) * 30.0) * smoothstep(0.0, -0.4, dv.y) * smoothstep(-1.2, -0.2, dv.y) * 0.12) * lamps * flick * smoothstep(0.0, 0.04, k);
      }
    }
  }
  vec2 cat = mix(vec2(0.02, hb + 0.19), vec2(0.30 * A() - 0.05, hb + 0.13 + uAlt * 0.05), full);
  float ch = mix(0.6, 0.3, full);
  vec4 cty = city(q - vec2(0.0, sin(uTime * 0.4) * 0.006), cat, ch);
  vec3 cityCol = cty.rgb * mix(vec3(0.85, 0.82, 1.0), tint, 0.4) + vec3(0.06, 0.05, 0.04);
  cityCol = mix(cityCol, cityCol * vec3(0.45, 0.5, 0.7) + vec3(0.02, 0.025, 0.05), night * 0.6);
  col = mix(col, cityCol, cty.a * 0.96);
  /* the island being looked at: a shaft of its own light, and a pool on the cloud below */
  if (uFocus.z > 0.001) {
    float up = q.y - uFocus.y;
    float wdt = 0.03 + max(up, 0.0) * 0.16;
    float shaft = exp(-pow((q.x - uFocus.x) / wdt, 2.0)) * smoothstep(-0.06, 0.1, up) * (0.45 + 0.55 * smoothstep(0.55, 0.0, up));
    vec2 pd = (q - vec2(uFocus.x, uFocus.y - 0.21)) / vec2(0.2, 0.035);
    float pool = exp(-dot(pd, pd));
    col += uAccent * (shaft * 0.14 + pool * 0.2) * uFocus.z;
  }
  col = mix(col, col * (0.75 + uAccent * 0.6) + uAccent * 0.05, uAccentAmt * 0.6);
  return col;
}

/* ── the threshold, far to near ───────────────────────────────────────── */

vec3 sky(vec2 p, float full) {
  float hz = uHz;
  float t = clamp((p.y - hz) / (0.5 - hz), 0.0, 1.0);
  vec3 col = mix(vec3(0.13, 0.17, 0.29), vec3(0.055, 0.08, 0.16), smoothstep(0.0, 0.32, t));
  col = mix(col, vec3(0.016, 0.022, 0.048), smoothstep(0.3, 1.0, t));
  /* the warm light of the world beyond, leaking along the horizon behind the ring */
  float dx = p.x - uPortal.x;
  col += vec3(0.95, 0.72, 0.55) * 0.1 * exp(-abs(p.y - hz) * 13.0) * exp(-dx * dx * 1.6) * on(0.15, 0.5);
  col += vec3(0.91, 0.78, 0.67) * 0.05 * exp(-abs(p.y - hz) * 22.0);
  float d = length((p - uPortal.xy) * vec2(1.0, 0.9));
  col += vec3(0.25, 0.48, 0.47) * 0.2 * exp(-max(d - uPortal.z, 0.0) * 3.6) * on(0.45, 0.85) * (0.85 + 0.6 * uHover);
  if (full > 0.5) {
    float n = fbm(p * 2.1 + vec2(uTime * 0.004, 0.0));
    col += vec3(0.44, 0.56, 0.78) * pow(n, 3.2) * 0.4 * smoothstep(hz + 0.04, 0.5, p.y);
    vec2 sp = p * 300.0;
    vec2 cell = floor(sp);
    float h = h21(cell);
    float band = fbm3(vec2((p.x + p.y * 0.6) * 1.2, (p.y - p.x * 0.4) * 5.0));
    col += vec3(0.5, 0.58, 0.8) * smoothstep(0.55, 0.85, band) * 0.06 * smoothstep(hz + 0.05, 0.45, p.y);
    if (h > 0.993) {
      vec2 f = fract(sp) - 0.5 - (vec2(h21(cell + 1.3), h21(cell + 2.7)) - 0.5) * 0.6;
      float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h * 3.0) + h * 40.0);
      float big = step(0.9988, h);
      col += vec3(0.88, 0.9, 1.0) * smoothstep(0.3 + big * 0.15, 0.0, length(f)) * tw * smoothstep(hz + 0.03, hz + 0.25, p.y) * (0.7 + big);
    }
  }
  return col;
}

vec4 moon(vec2 p, vec2 c, float r) {
  vec2 q = (p - c) / r;
  float l = dot(q, q);
  if (l > 9.0) return vec4(0.0);
  float rr = sqrt(l);
  vec3 n = vec3(q, sqrt(max(0.0, 1.0 - l)));
  float a = uMoon * TAU;
  vec3 L = normalize(vec3(sin(a), 0.12, -cos(a)));
  float lit = smoothstep(-0.06, 0.22, dot(n, L));
  float crater = fbm3(q * 2.6 + c * 17.0);
  vec3 base = mix(vec3(0.55, 0.56, 0.62), vec3(0.97, 0.92, 0.86), crater);
  vec3 col = base * lit + vec3(0.035, 0.045, 0.07);
  float disk = smoothstep(1.0, 0.95, rr);
  float halo = exp(-max(rr - 1.0, 0.0) * 2.2) * 0.22 * (0.2 + 0.8 * abs(cos(a * 0.5))) * (1.0 - disk);
  return vec4(col * disk + vec3(0.75, 0.8, 0.95) * halo, max(disk, halo));
}

/* The large moon wears a thin ring, tilted; the half behind it is hidden by it. */
vec3 ringedMoon(vec2 p, vec3 col) {
  vec2 c = uMoonA.xy;
  float r = uMoonA.z;
  vec2 q = rot(0.42) * (p - c) / r;
  if (dot(q, q) > 12.0) return col;
  vec4 m = moon(p, c, r);
  col = mix(col, m.rgb, m.a * on(0.1, 0.4));
  float e = length(q * vec2(1.0, 4.4));
  float band = smoothstep(0.13, 0.09, abs(e - 2.0)) * (1.0 - 0.75 * smoothstep(0.03, 0.01, abs(e - 1.96)));
  band *= 1.0 - step(0.0, q.y) * step(length(q), 1.0);
  vec3 rc = vec3(0.86, 0.8, 0.72) * (0.35 + 0.65 * smoothstep(-2.0, 2.0, q.x));
  return mix(col, rc, band * 0.4 * on(0.15, 0.45));
}

/* A small floating island, far off: a flat top, a root of rock, and the haze. */
vec3 isle(vec2 p, vec2 c, float s, vec3 col, float haze) {
  vec2 u = (p - c) / s;
  if (abs(u.x) > 1.3 || abs(u.y) > 1.3) return col;
  float top = 0.12 + 0.08 * vn(vec2(u.x * 5.0, c.x * 9.0));
  float bot = -0.8 * sqrt(max(0.0, 1.0 - u.x * u.x)) * (0.75 + 0.45 * vn(vec2(u.x * 7.0, 2.0)));
  float m = smoothstep(0.06, 0.0, abs(u.x) - 1.0) * smoothstep(bot - 0.04, bot + 0.04, u.y) * smoothstep(top + 0.04, top - 0.04, u.y);
  vec3 c0 = mix(vec3(0.04, 0.055, 0.1), vec3(0.13, 0.17, 0.28), haze);
  c0 += vec3(0.45, 0.55, 0.72) * 0.14 * smoothstep(top - 0.14, top, u.y);
  c0 += vec3(1.0, 0.82, 0.55) * step(0.94, h21(floor(u * vec2(16.0, 8.0)) + c * 7.0)) * step(0.0, u.y) * 0.5;
  return mix(col, c0, m * on(0.12, 0.5));
}

/* The city that floats far off over the sea: an inverted mountain carrying a crown
   of towers, its lights pricked through the haze, a thread of light rising from
   its tallest spire, and water falling from its underside into nothing. */
vec3 farCity(vec2 p, vec3 col) {
  vec2 u = (p - uFar.xy) / uFar.z;
  u.y -= sin(uTime * 0.13) * 0.012;
  if (abs(u.x) > 1.3 || u.y < -1.6) return col;
  float vis = on(0.12, 0.5);
  float bx = 0.16;
  col += vec3(0.7, 0.92, 0.9) * exp(-abs(u.x - bx) * 70.0) * smoothstep(0.55, 1.6, u.y) * 0.06 * vis * (0.75 + 0.25 * sin(uTime * 0.6));
  if (u.y > 1.0) return col;
  vec3 haze = vec3(0.12, 0.16, 0.27);
  float ax = abs(u.x);
  float under = -0.62 * pow(max(0.0, 1.0 - ax * ax), 0.6) * (0.85 + 0.3 * vn(vec2(u.x * 6.0, 2.0)));
  float rock = smoothstep(under - 0.02, under + 0.02, u.y) * step(u.y, 0.0) * smoothstep(1.02, 0.98, ax);
  float n = (u.x + 1.0) * 15.0;
  float cell = floor(n);
  float hc = h21(vec2(cell, 3.0));
  float spire = step(0.86, hc);
  float th = (0.06 + 0.3 * hc * hc) * (1.0 - ax * 0.8) + spire * 0.26;
  float cw = abs(fract(n) - 0.5);
  float tw = mix(0.36, 0.1, spire);
  if (abs(u.x - bx) < 0.025) { th = 0.56; tw = 0.5; }
  float tower = step(0.0, u.y) * step(u.y, th) * step(ax, 0.86) * step(cw, tw);
  float dome = step(length((u - vec2(-0.42, 0.0)) * vec2(1.0, 1.6)), 0.16);
  float m = max(max(rock, tower), dome);
  if (m > 0.0) {
    vec3 sil = mix(haze, vec3(0.05, 0.07, 0.13), 0.5);
    sil += vec3(0.32, 0.36, 0.5) * 0.1 * smoothstep(0.0, -0.4, u.y) * rock;
    float win = step(0.84, h21(floor(vec2(u.x * 120.0, u.y * 80.0)))) * max(tower, dome) * step(0.02, u.y);
    sil += vec3(1.0, 0.82, 0.55) * win * 0.6;
    col = mix(col, sil, m * vis * 0.9);
  }
  float tip = exp(-length((u - vec2(bx, 0.57)) * vec2(1.0, 1.0)) * 70.0);
  col += vec3(1.0, 0.85, 0.65) * tip * 0.5 * vis;
  float fall = exp(-abs(u.x + 0.56) * 140.0) * step(u.y, -0.3) * smoothstep(-1.5, -0.4, u.y);
  col += vec3(0.6, 0.7, 0.86) * fall * 0.14 * vis;
  col += vec3(1.0, 0.8, 0.6) * 0.035 * exp(-length(u * vec2(0.8, 2.2)) * 2.0) * vis;
  return col;
}

/* Banks of cloud standing on the horizon: a high far one and a low near one. */
vec3 bankFar(vec2 p, vec3 col) {
  float y = p.y - uHz;
  if (y < 0.0 || y > 0.15) return col;
  float h1 = 0.02 + 0.1 * pow(fbm3(vec2(p.x * 1.5 + uTime * 0.003, 4.0)), 1.6) + 0.018 * vn(vec2(p.x * 9.0 + uTime * 0.004, 2.0));
  float m1 = smoothstep(h1 + 0.005, h1 - 0.005, y);
  float lit = smoothstep(h1 - 0.03, h1, y) * (0.6 + 0.4 * vn(vec2(p.x * 22.0, y * 40.0)));
  vec3 c1 = mix(vec3(0.09, 0.12, 0.2), vec3(0.3, 0.34, 0.47), lit);
  c1 += vec3(0.75, 0.5, 0.38) * 0.1 * exp(-pow((p.x - uPortal.x) * 1.3, 2.0)) * (1.0 - lit);
  return mix(col, c1, m1 * 0.62 * on(0.1, 0.45));
}
vec3 bankNear(vec2 p, vec3 col) {
  float y = p.y - uHz;
  if (y < 0.0 || y > 0.06) return col;
  float h2 = 0.01 + 0.035 * fbm3(vec2(p.x * 3.0 - uTime * 0.006, 9.0));
  float m2 = smoothstep(h2 + 0.004, h2 - 0.004, y);
  float lit = smoothstep(h2 - 0.02, h2, y);
  return mix(col, mix(vec3(0.055, 0.075, 0.13), vec3(0.19, 0.23, 0.34), lit), m2 * 0.88 * on(0.1, 0.45));
}

/* Mesas, and the broken arch: a fragment of a ring far larger than this one. */
vec3 far(vec2 p, vec3 col) {
  float hz = uHz;
  if (p.y < hz || p.y > hz + 0.42) return col;
  float fog = on(0.18, 0.55);
  vec3 haze = vec3(0.16, 0.2, 0.32);
  float h1 = max(0.0, 0.07 * pow(fbm3(vec2(p.x * 2.4, 7.3)), 2.0) - 0.012);
  col = mix(col, mix(haze, vec3(0.1, 0.13, 0.22), 0.35), smoothstep(hz + h1 + 0.0015, hz + h1, p.y) * fog * 0.7);
  float n = vn(vec2(p.x * 3.4 + 11.0, 2.0));
  float h2 = max(0.0, 0.05 * pow(n, 3.0) - 0.006);
  col = mix(col, vec3(0.05, 0.07, 0.12), smoothstep(hz + h2 + 0.0012, hz + h2, p.y) * fog * 0.85);
  vec2 M = vec2(-0.42 * A(), hz - 0.08);
  float rm = 0.4;
  vec2 dm = p - M;
  float ang = atan(dm.y, dm.x);
  float dr = length(dm) - rm;
  float band = smoothstep(0.011, 0.008, abs(dr)) * step(0.3, ang) * step(ang, 2.5) * step(0.14, fract(ang * 2.1 + 0.25));
  vec3 archC = mix(vec3(0.08, 0.1, 0.17), vec3(0.2, 0.24, 0.36), smoothstep(-0.008, 0.008, dr));
  col = mix(col, archC, band * fog * 0.8);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 lp = M + rm * vec2(cos(0.6 + fi * 0.75), sin(0.6 + fi * 0.75));
    col += vec3(0.6, 0.9, 0.85) * exp(-length(p - lp) * 1100.0) * (0.5 + 0.5 * sin(uTime * 1.3 + fi * 2.0)) * fog;
  }
  return col;
}

float fogBand(vec2 p, float full) {
  float y = p.y - uHz;
  float a = fbm3(vec2(p.x * 1.4 + uTime * 0.012, y * 9.0 + 3.0));
  float b = full > 0.5 ? fbm3(vec2(p.x * 2.3 - uTime * 0.008 + 4.0, y * 14.0)) : 0.5;
  return clamp((a * 0.75 + b * 0.5 - 0.47) * 1.7, 0.0, 1.0) * exp(-max(y, 0.0) * 16.0);
}

/* The light that occasionally crosses the sky: slow, deliberate, and gone. */
vec3 traveller(vec2 p, vec3 col) {
  float u = fract(uTime / 41.0);
  vec2 a0 = vec2(mix(-0.75, 0.75, u) * A(), 0.36 - 0.06 * u);
  vec2 back = a0 - vec2(0.12, -0.012);
  vec2 pa = p - back, ba = a0 - back;
  float k = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float trail = exp(-length(pa - ba * k) * 1400.0) * k * k;
  float head = exp(-length(p - a0) * 900.0);
  float vis = smoothstep(0.0, 0.08, u) * smoothstep(0.62, 0.5, u);
  return col + vec3(0.85, 0.95, 1.0) * (trail * 0.35 + head * 1.4) * vis;
}

vec3 above(vec2 p, float full) {
  vec2 pk = at(p, 40.0);
  vec3 col = sky(pk, full);
  col = ringedMoon(at(p, 60.0), col);
  vec4 m2 = moon(at(p, 60.0), uMoonA.xy + vec2(0.11, -0.06), uMoonA.z * 0.3);
  col = mix(col, m2.rgb * vec3(0.92, 0.85, 1.0), m2.a * on(0.15, 0.45));
  if (full > 0.5) {
    float wisp = fbm3(vec2(pk.x * 0.9 - uTime * 0.005, pk.y * 6.5));
    col = mix(col, vec3(0.22, 0.27, 0.38), smoothstep(0.55, 0.85, wisp) * smoothstep(uHz + 0.1, 0.35, pk.y) * 0.32);
  }
  col = bankFar(at(p, 9.0), col);
  col = farCity(at(p, 7.0), col);
  float hazeA = uCliff.w > 0.5 ? 0.0 : 1.0;
  col = isle(at(p, 12.0), vec2(uFar.x + 0.2 * hazeA - 0.02, uFar.y + 0.13), 0.018, col, 0.78);
  col = isle(at(p, 8.0), vec2(uFar.x - 0.27, uFar.y - 0.08), 0.03, col, 0.62);
  col = far(at(p, 5.0), col);
  col = bankNear(at(p, 3.5), col);
  col = traveller(pk, col);
  vec2 pf = at(p, 3.0);
  float fb = fogBand(pf, full);
  float near = exp(-length(pf - uPortal.xy) * 2.0);
  col = mix(col, mix(vec3(0.17, 0.22, 0.33), vec3(0.42, 0.62, 0.62), near), fb * 0.55);
  return col;
}

/* ── the ring ─────────────────────────────────────────────────────────── */

/* Where a ray through this pixel meets a cylinder of radius r around the ring's
   axis, as a distance from the camera's starting point; -1 if not between zmin
   and zmax. far picks the farther of the two meetings. */
float hitDepth(vec2 q, vec2 Om, float r, float zmin, float zmax, float farHit) {
  float aa = dot(Om, Om) - r * r;
  float bb = -2.0 * dot(q, Om);
  float cc = dot(q, q);
  float u1, u2;
  if (abs(aa) < 1e-6) { u1 = -cc / bb; u2 = u1; }
  else {
    float disc = bb * bb - 4.0 * aa * cc;
    if (disc < 0.0) return -1.0;
    float sq = sqrt(disc);
    u1 = (-bb - sq) / (2.0 * aa);
    u2 = (-bb + sq) / (2.0 * aa);
  }
  float z1 = u1 > 0.0 ? gS + 1.0 / u1 : -1.0;
  float z2 = u2 > 0.0 ? gS + 1.0 / u2 : -1.0;
  float lo = max(zmin, gS + 0.004);
  bool ok1 = z1 >= lo && z1 <= zmax;
  bool ok2 = z2 >= lo && z2 <= zmax;
  if (ok1 && ok2) return farHit > 0.5 ? max(z1, z2) : min(z1, z2);
  if (ok1) return z1;
  if (ok2) return z2;
  return -1.0;
}

/* The ring is a thick tube of stone on its own axis, seen in perspective from off
   to one side: its front face, the inside of its bore lit by the far opening, the
   outside of its wall, a dial of thirty-five blocks just in front of it (one for
   each world), and an orbit of light. O is its centre relative to the vanishing
   point at distance 1; drawing it with O mirrored below the water gives the
   reflection. Returns the surface and its cover; light goes into glow. */
vec4 ring(vec2 p, vec2 O, float mir, out vec3 glow) {
  glow = vec3(0.0);
  vec2 V = Vp();
  vec2 q = p - V;
  vec2 Om = O - gM;
  float R = uPortal.z, Ri = R * 0.78;
  float zf = 1.0 - gS, zb = 1.0 + DEPTH - gS, zd = 0.95 - gS;
  float fy = mir > 0.5 ? -1.0 : 1.0;
  float lit = on(0.45, 0.8);
  float hov = uHover;
  float travel = smoothstep(0.25, 0.9, gS);
  vec2 Cf = V + Om / max(zf, 0.001);
  float df = zf > 0.003 ? length(p - Cf) : 1e5;
  float rf = zf > 0.003 ? df * zf / R : 0.0;
  if (zf > 0.003 && rf > 1.45 && length(p - (V + Om / zb)) * zb / R > 1.45) return vec4(0.0);

  if (zf > 0.003) {
    vec2 dd = p - Cf;
    float a = atan(dd.y * fy, dd.x);
    /* the orbit of light, with three pulses running round it */
    float orbit = exp(-pow((rf - 1.27) / 0.0045, 2.0));
    float pulses = 0.0;
    if (mir < 0.5) {
      for (int i = 0; i < 3; i++) {
        float pa = uTime * (0.22 + 0.25 * hov) + float(i) * 2.0944;
        float dpa = abs(mod(a - pa + PI, TAU) - PI);
        pulses += exp(-dpa * dpa * 60.0);
      }
    }
    glow += vec3(0.6, 0.9, 0.85) * orbit * (0.16 + pulses * 1.2) * on(0.72, 0.95) * (0.8 + 0.6 * hov);
    /* a hairline of light at the lip, split into colours when you come close */
    vec3 ca = vec3(-1.0, 0.0, 1.0) * (0.003 + 0.0035 * hov);
    vec3 rimE = exp(-pow((vec3(rf) - (0.78 + ca)) / 0.0055, vec3(2.0)));
    glow += rimE * vec3(1.0, 0.97, 0.92) * (0.9 + 1.3 * hov) * on(0.5, 0.75);
  }

  /* the dial: thirty-five blocks a little in front of the face, one for each world */
  if (zd > 0.01) {
    vec2 Cd = V + Om / zd;
    vec2 dd = p - Cd;
    float rr = length(dd) * zd / R;
    if (rr > 1.02 && rr < 1.22) {
      float fa = fract((PI * 0.5 - atan(dd.y * fy, dd.x) + uDialRot) / TAU);
      float slot = fa * NB;
      float id = floor(slot);
      float b = fract(slot);
      float hot = 1.0 - step(0.5, abs(id - uDialHot));
      float r0 = 1.035 + 0.03 * hot, r1 = 1.13 + 0.03 * hot + 0.03 * h21(vec2(id, 3.0));
      float blk = step(0.07, b) * step(b, 0.93) * step(r0, rr) * step(rr, r1);
      /* the side of each block, so it has thickness */
      float side = step(0.07, b) * step(b, 0.93) * step(r1, rr) * step(rr, r1 + 0.018) * (1.0 - blk);
      if (blk + side > 0.0) {
        float seen = id < 18.0 ? bit(uSeen.x, id) : bit(uSeen.y, id - 18.0);
        float ign = smoothstep(fa - 0.03, fa, (uIntro - 0.52) / 0.3);
        float face = 0.5 + 0.5 * dot(normalize(vec2(dd.x, dd.y * fy)), vec2(-0.55, 0.83));
        vec3 stone = mix(vec3(0.03, 0.035, 0.055), vec3(0.15, 0.16, 0.21), face * face);
        float mid = (r0 + r1) * 0.5;
        float glyph = step(0.5, fract(b * 3.0 + h21(vec2(id, 7.0)))) * step(abs(rr - mid), 0.007) * step(0.2, b) * step(b, 0.8);
        vec3 gc = mix(vec3(0.42, 0.8, 0.74) * 0.4, vec3(1.0, 0.84, 0.62) * 1.8, seen);
        gc = mix(gc, vec3(1.0, 0.96, 0.88) * 2.2, hot);
        stone += gc * glyph * ign * (0.65 + 0.6 * hov);
        /* a world you have visited keeps a warm light in its block */
        stone += vec3(1.0, 0.78, 0.52) * (0.07 + 0.05 * sin(uTime * 1.2 + id)) * seen * ign * blk;
        stone += vec3(0.9, 0.95, 1.0) * 0.08 * hot * blk;
        stone += vec3(0.9, 0.85, 0.8) * smoothstep(0.014, 0.0, r1 - rr) * max(face - 0.35, 0.0) * 0.3 * blk;
        if (side > 0.0) stone = mix(vec3(0.012, 0.014, 0.022), stone, 0.25);
        return vec4(stone, 1.0);
      }
    }
  }

  /* the front face */
  if (zf > 0.003 && rf >= 0.78 && rf <= 1.0) {
    vec2 dd = p - Cf;
    vec2 n = normalize(vec2(dd.x, dd.y * fy));
    float a = atan(n.y, n.x);
    float u = (rf - 0.78) / 0.22;
    float face = 0.5 + 0.5 * dot(n, vec2(-0.6, 0.8));
    float grain = vn(vec2(a * 40.0, rf * 260.0));
    vec3 stone = mix(vec3(0.026, 0.032, 0.05), vec3(0.1, 0.11, 0.15), face) * (0.85 + 0.3 * grain);
    float seam = smoothstep(0.0, 0.04, abs(fract(a / TAU * 20.0) - 0.5) - 0.465);
    float ch = smoothstep(0.022, 0.0, abs(u - 0.46)) + 0.6 * smoothstep(0.016, 0.0, abs(u - 0.74));
    float step1 = smoothstep(0.0, 0.03, u - 0.24) * 0.25;
    stone *= 0.8 + step1;
    stone *= 1.0 - 0.45 * seam;
    float breathe = 0.75 + 0.25 * sin(uTime * 0.6);
    stone += vec3(0.45, 0.85, 0.78) * ch * 0.32 * on(0.55, 0.8) * (0.5 + 1.0 * hov) * breathe;
    float pa = uTime * 0.3;
    float dpa = abs(mod(a - pa + PI, TAU) - PI);
    stone += vec3(1.0, 0.9, 0.74) * ch * exp(-dpa * dpa * 10.0) * 0.9 * on(0.72, 0.95);
    /* the inner bevel catches the opening's light; its highlight slides as you look round */
    float bev = smoothstep(0.12, 0.0, u);
    vec2 view = normalize(vec2(-0.45 - uMouse.x * 0.8, 0.9 + uMouse.y * 0.5));
    float hl = pow(max(0.0, dot(n, view)), 22.0);
    stone += vec3(1.0, 0.92, 0.8) * bev * (0.28 + 1.5 * hl) * lit;
    stone += vec3(0.5, 0.55, 0.7) * smoothstep(0.9, 1.0, u) * max(face - 0.3, 0.0) * 0.28;
    return vec4(stone, 1.0);
  }

  if (zf <= 0.003 || rf < 0.78) {
    /* inside the front opening: the far opening, or the inside of the bore */
    if (zb > 0.0005) {
      vec2 Cb = V + Om / zb;
      float rb = Ri / zb;
      float db = length(p - Cb);
      if (db < rb) {
        vec2 m = (p - Cb) / rb;
        float mr = length(m);
        float sc = min(rb / 0.78 * (1.0 + 0.07 * hov), 1.0);
        float k = smoothstep(0.2, 1.0, sc);
        vec2 view = (p - Cb * (1.0 - k)) / sc;
        view *= 1.0 - 0.06 * smoothstep(0.6, 1.0, mr) * (1.0 + hov) * (1.0 - k);
        view += uMouse * vec2(0.03, 0.02) * (1.0 - mr) * (1.0 - k);
        /* crossing: the surface shivers just before you pass through it */
        float cross = exp(-pow(zb / 0.06, 2.0));
        view += normalize(m + 1e-4) * sin(mr * 24.0 - uTime * 7.0) * 0.02 * cross;
        if (mir > 0.5) view.y = -view.y;
        vec3 b = beyond(view, k);
        float caus = vn(m * 5.0 + vec2(uTime * 0.05, -uTime * 0.04)) * vn(m * 9.0 - vec2(uTime * 0.07, 0.0));
        b += vec3(0.9, 0.95, 1.0) * caus * 0.05 * (1.0 + 2.0 * hov) * (1.0 - k);
        b *= mix(1.0, 0.62, smoothstep(0.7, 1.0, mr) * (1.0 - k));
        float fill = smoothstep(mr - 0.25, mr, (uIntro - 0.45) / 0.28 * 1.3);
        vec3 colm = mix(vec3(0.01, 0.015, 0.03), b, fill);
        colm += vec3(0.6, 0.9, 0.85) * cross * 0.14 * (0.6 + 0.4 * sin(mr * 30.0 - uTime * 9.0));
        colm += vec3(1.0, 0.94, 0.86) * exp(-pow((1.0 - mr) * rb / 0.003, 2.0)) * lit * 0.55;
        return vec4(colm, 1.0);
      }
      float Z = hitDepth(q, Om, Ri, 1.0, 1.0 + DEPTH, 1.0);
      if (Z > 0.0) {
        vec2 wc = V + Om / (Z - gS);
        vec2 wv = p - wc;
        float a = atan(wv.y * fy, wv.x);
        float dep = (Z - 1.0) / DEPTH;
        vec3 wall = mix(vec3(0.02, 0.024, 0.038), vec3(0.15, 0.14, 0.16), pow(dep, 1.6) * on(0.4, 0.7));
        wall += vec3(1.0, 0.8, 0.6) * pow(dep, 5.0) * 0.4 * lit;
        float rib = exp(-pow((fract(dep * 7.0) - 0.5) / 0.05, 2.0));
        float cid = floor(a / TAU * 24.0);
        float chan = smoothstep(0.07, 0.0, abs(fract(a / TAU * 24.0) - 0.5) - 0.43);
        float flow = smoothstep(0.72, 1.0, fract(dep * 5.0 - uTime * 0.25 + h21(vec2(cid, 2.0))));
        wall += vec3(0.45, 0.85, 0.78) * rib * (0.16 + 0.9 * travel) * lit;
        wall += vec3(1.0, 0.88, 0.72) * chan * flow * (0.22 + 0.5 * hov + 0.7 * travel) * on(0.6, 0.9);
        wall *= 0.65 + 0.35 * dep;
        return vec4(wall, 1.0);
      }
      return vec4(vec3(0.012, 0.014, 0.024), 1.0);
    }
    return vec4(0.0);
  }

  /* outside the front face: the outer wall of the tube */
  float Z = hitDepth(q, Om, R, 1.0, 1.0 + DEPTH, 0.0);
  if (Z > 0.0) {
    vec2 wc = V + Om / (Z - gS);
    vec2 n = normalize(vec2((p - wc).x, (p - wc).y * fy));
    float dep = (Z - 1.0) / DEPTH;
    float face = 0.5 + 0.5 * dot(n, vec2(-0.6, 0.8));
    vec3 wall = mix(vec3(0.018, 0.022, 0.035), vec3(0.07, 0.075, 0.1), face) * (1.0 - 0.45 * dep);
    wall += vec3(0.2, 0.25, 0.35) * exp(-pow((fract(dep * 4.0) - 0.5) / 0.04, 2.0)) * 0.05;
    wall += vec3(0.45, 0.8, 0.75) * exp(-dep * 25.0) * 0.1 * lit;
    return vec4(wall, 1.0);
  }
  return vec4(0.0);
}

/* The ring as the sea shows it: the same outline, rippled and dim, so it is drawn
   with far less work than the ring itself. No depth solving, no dial glyphs,
   and the world in its opening is a gradient with the city in it rather than
   a full sky and cloud sea. */
vec4 ringMirror(vec2 p, vec2 O, out vec3 glow) {
  glow = vec3(0.0);
  vec2 V = Vp();
  vec2 Om = O - gM;
  float R = uPortal.z;
  float zf = 1.0 - gS, zb = 1.0 + DEPTH - gS;
  if (zf < 0.02) return vec4(0.0);
  vec2 Cf = V + Om / zf;
  float rf = length(p - Cf) * zf / R;
  if (rf > 1.32) return vec4(0.0);
  float lit = on(0.45, 0.8);
  glow += vec3(0.6, 0.9, 0.85) * exp(-pow((rf - 1.27) / 0.006, 2.0)) * 0.2 * on(0.72, 0.95);
  glow += vec3(1.0, 0.97, 0.92) * exp(-pow((rf - 0.78) / 0.008, 2.0)) * (0.7 + uHover) * on(0.5, 0.75);
  vec2 dd = p - Cf;
  float face = 0.5 - 0.5 * dot(normalize(dd), vec2(-0.6, 0.8));
  if (rf > 1.02) {
    float fa = fract((PI * 0.5 + atan(dd.y, dd.x) + uDialRot) / TAU) * NB;
    float blk = step(0.07, fract(fa)) * step(fract(fa), 0.93) * step(rf, 1.15);
    return vec4(mix(vec3(0.03, 0.035, 0.055), vec3(0.12, 0.13, 0.17), face), blk);
  }
  if (rf > 0.78) return vec4(mix(vec3(0.026, 0.032, 0.05), vec3(0.09, 0.1, 0.13), face), 1.0);
  vec2 Cb = V + Om / zb;
  float rb = R * 0.78 / zb;
  vec2 m = (p - Cb) / rb;
  float mr = length(m);
  if (mr < 1.0) {
    /* the world beyond, upside down: its sky, its warm horizon, its city */
    float t = -m.y * 0.78 + 0.11;
    vec3 b = mix(vec3(1.0, 0.8, 0.6), vec3(0.17, 0.25, 0.42), smoothstep(0.0, 0.16, t));
    b = mix(b, vec3(0.035, 0.055, 0.14), smoothstep(0.12, 0.55, t));
    if (t < 0.0) b = mix(vec3(0.52, 0.52, 0.68), vec3(1.0, 0.8, 0.6) * 0.92, exp(t * 9.0));
    vec4 cty = city(vec2(m.x, -m.y) * 0.78, vec2(0.02, -0.11 + 0.19), 0.6);
    b = mix(b, cty.rgb * vec3(0.85, 0.82, 1.0) + vec3(0.06, 0.05, 0.04), cty.a * 0.96);
    b *= mix(1.0, 0.62, smoothstep(0.7, 1.0, mr));
    float fill = smoothstep(mr - 0.25, mr, (uIntro - 0.45) / 0.28 * 1.3);
    return vec4(mix(vec3(0.01, 0.015, 0.03), b, fill), 1.0);
  }
  /* the bore, as a warm gradient towards the far opening */
  float dep = sat((0.78 - rf) / 0.78 * 3.0);
  vec3 wall = mix(vec3(0.02, 0.024, 0.038), vec3(0.16, 0.14, 0.15), dep * on(0.4, 0.7)) + vec3(1.0, 0.8, 0.6) * pow(dep, 4.0) * 0.3 * lit;
  return vec4(wall, 1.0);
}

/* ── the sea, and what stands in it ───────────────────────────────────── */

/* The causeway's line across the water: from just in front of you to the foot
   of the ring, as a sideways position at distance z. */
float causeX(float z) {
  float l0 = (uCliff.w > 0.5 ? 0.0 : 0.13) * 0.1;
  return mix(l0, gO.x, (z - 0.1) / 0.9);
}

/* The sea stack beside the ring, with a stair cut round it and a lighthouse on top. */
vec3 stack(vec2 p, vec3 col, float mir) {
  float sx = uCliff.y, top = uCliff.z, hz = uHz;
  float base = hz - EYE / 0.8;
  float H = top - base;
  vec2 lt = vec2(sx + 0.012, top);
  vec2 lamp = vec2(lt.x, top + 0.043);
  if (mir < 0.5) {
    vec2 bd = p - lamp;
    float bang = abs(mod(atan(bd.y, bd.x) - uTime * 0.5 + PI, TAU) - PI);
    float beam = smoothstep(0.07, 0.0, bang) * exp(-length(bd) * 5.0);
    col += vec3(1.0, 0.88, 0.62) * (beam * 0.45 * uLamp + exp(-length(bd) * 55.0) * 0.07 * (0.3 + uLamp));
  }
  if (p.y < base - 0.004 || p.y > top + 0.06 || abs(p.x - sx) > 0.08) return col;
  float t = (p.y - base) / H;
  float w = mix(0.052, 0.012, pow(sat(t), 0.55)) * (1.0 + 0.55 * (fbm3(vec2(p.y * 9.0, 3.0)) - 0.5)) + 0.004 * (vn(vec2(p.y * 70.0, 2.0)) - 0.5);
  float dx = p.x - (sx + 0.012 * t * t);
  float body = smoothstep(0.0015, -0.0015, abs(dx) - w) * step(p.y, top) * step(base - 0.003, p.y);
  float towerM = step(abs(p.x - lt.x), 0.0028 - (p.y - top) * 0.012) * step(top, p.y) * step(p.y, top + 0.038);
  float cap = step(length((p - lamp) * vec2(1.0, 1.4)), 0.0046);
  float m = max(body, max(towerM, cap));
  vec3 stone = vec3(0.02, 0.025, 0.04) + vec3(0.02, 0.022, 0.03) * fbm3(p * vec2(30.0, 12.0));
  float sideP = sat(dx / max(w, 0.001));
  stone += vec3(0.35, 0.7, 0.66) * pow(sideP, 6.0) * 0.32 * on(0.45, 0.8) * (0.8 + 0.4 * uHover);
  stone += vec3(0.32, 0.38, 0.55) * pow(sat(-dx / max(w, 0.001)), 6.0) * 0.12;
  float stair = smoothstep(0.05, 0.0, abs(fract(t * 6.0 + dx * 26.0) - 0.5) - 0.44) * body * step(0.08, t) * step(t, 0.9);
  stone += vec3(0.4, 0.44, 0.55) * stair * 0.1;
  vec2 wc = vec2(dx * 160.0, t * 30.0);
  vec2 wf = fract(wc) - 0.5;
  float win = step(0.9, h21(floor(wc))) * step(abs(wf.x), 0.18) * step(abs(wf.y), 0.22) * body * step(abs(dx), w * 0.55) * step(0.12, t) * step(t, 0.92);
  stone += vec3(1.0, 0.8, 0.5) * win * 0.7 * on(0.6, 0.9);
  stone += vec3(1.0, 0.9, 0.65) * cap * (0.5 + 2.5 * uLamp);
  col = mix(col, stone, m);
  return col;
}

vec3 causeway(vec2 p, vec2 w, vec3 col) {
  float z = w.y;
  if (z > 0.975 || z < 0.12) return col;
  float hw = uCliff.w > 0.5 ? 0.011 : 0.016;
  float dx = w.x - causeX(z);
  if (abs(dx) > hw * 1.3) return col;
  float m = smoothstep(hw, hw * 0.93, abs(dx)) * smoothstep(0.12, 0.3, z);
  float slab = fract(z * 15.0);
  m *= 1.0 - smoothstep(0.86, 0.9, slab);
  vec3 st = vec3(0.02, 0.024, 0.038) + vec3(0.018) * vn(w * vec2(300.0, 40.0));
  float near = exp(-(0.975 - z) * 2.4);
  st += vec3(0.45, 0.8, 0.76) * (smoothstep(hw * 0.78, hw, abs(dx)) * 0.32 + smoothstep(0.74, 0.86, slab) * 0.22) * near * on(0.55, 0.9);
  st += vec3(0.3, 0.36, 0.52) * 0.04;
  return mix(col, st, m);
}

vec3 sea(vec2 p) {
  float k = uHz - p.y;
  float eye = EYE + gM.y;
  float zw = eye / max(k, 0.0003);
  vec2 w = vec2(p.x * zw + gM.x, zw + gS);
  vec2 wr = w * vec2(4.0, 4.0);
  float r1 = vn(wr * vec2(3.0, 1.1) + vec2(0.0, -uTime * 0.32));
  float r2 = vn(wr * vec2(8.0, 2.8) + vec2(uTime * 0.18, -uTime * 0.55));
  float r3 = vn(wr * vec2(22.0, 7.0) + vec2(-uTime * 0.3, -uTime * 1.1));
  float rip = (r1 - 0.5) * 0.6 + (r2 - 0.5) * 0.3 + (r3 - 0.5) * 0.25;
  vec2 rp = vec2(p.x + rip * k * 0.07, 2.0 * uHz - p.y + rip * k * 0.55 + 0.002);
  vec3 refl = above(rp, 0.0);
  vec2 rq = vec2(p.x + rip * k * 0.07, p.y - rip * k * 0.5);
  vec3 g2;
  vec4 rr = ringMirror(rq, vec2(gO.x, -gO.y - 2.0 * EYE), g2);
  float rfade = exp(-k * 3.2);
  refl = mix(refl, rr.rgb, rr.a * (0.35 + 0.65 * rfade)) + g2 * 0.8 * rfade;
  if (gS < 0.79) {
    vec2 s0 = at(rq, 0.8);
    s0.y = 2.0 * (uHz - EYE / 0.8) - s0.y;
    refl = stack(s0, refl, 1.0);
  }
  float fres = mix(0.18, 0.62, exp(-k * 6.0));
  vec3 col = mix(vec3(0.006, 0.01, 0.022), refl * (0.85 + 0.3 * r3), fres);
  float streak = smoothstep(0.55, 0.95, vn(vec2(p.x * 6.0, zw * 8.0 - uTime * 0.2)));
  col += vec3(0.25, 0.32, 0.45) * streak * 0.05 * exp(-k * 3.0);
  /* the pool of light the ring throws on the water beneath it */
  float zr = max(1.0 - gS, 0.02);
  vec2 Cf = Vp() + (gO - gM) / zr;
  float wl = eye / zr;
  float pool = exp(-pow((p.x - Cf.x) / (uPortal.z * 0.8 / zr), 2.0)) * exp(-abs(k - wl) / (0.03 / zr));
  col += vec3(0.6, 0.86, 0.8) * pool * 0.14 * on(0.5, 0.85) * (0.8 + 0.6 * uHover);
  float gx = exp(-pow((p.x - Cf.x) / (uPortal.z * 0.55 / zr), 2.0));
  float gl = smoothstep(0.64, 0.92, vn(wr * vec2(14.0, 4.5) + vec2(0.0, -uTime * 0.9)));
  col += vec3(0.6, 0.9, 0.85) * gl * gx * 0.4 * (0.6 + 0.7 * uHover) * exp(-k * 1.6) * on(0.45, 0.8);
  return causeway(p, w, col);
}

/* The person on the causeway, just short of the ring, for scale. */
vec3 figure(vec2 p, vec3 col) {
  float zf = 0.93 - gS;
  if (zf < 0.03) return col;
  vec2 feet = Vp() + (vec2(causeX(0.93), -EYE) - gM) / zf;
  float hf = uPortal.z * 0.05 / zf;
  vec2 fp = (p - feet) / hf;
  if (abs(fp.x) > 1.0 || fp.y < -0.3 || fp.y > 1.3) return col;
  float body = length(vec2(fp.x * 3.4, max(abs(fp.y - 0.55) - 0.2, 0.0))) - 0.17;
  float head = length(fp - vec2(0.0, 0.9)) - 0.1;
  float legs = max(abs(abs(fp.x) - 0.045) - 0.03, abs(fp.y - 0.17) - 0.17);
  float coat = max(abs(fp.x) - (0.07 + (0.55 - fp.y) * 0.12), abs(fp.y - 0.45) - 0.12);
  float f = min(min(body, head), min(legs, coat));
  col = mix(col, vec3(0.004, 0.005, 0.009), smoothstep(0.04, -0.04, f) * on(0.55, 0.85));
  col += vec3(0.55, 0.85, 0.8) * exp(-abs(fp.y + 0.02) * 22.0) * step(abs(fp.x), 0.7) * 0.06 * on(0.55, 0.85);
  return col;
}

/* Stones adrift round the ring on slow, fixed paths, lit on the side that faces it. */
vec3 shards(vec2 p, vec3 col) {
  vec2 C = uPortal.xy;
  float R = uPortal.z;
  if (length((p - C) * vec2(0.55, 1.0)) > R * 1.9) return col;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float hh = h21(vec2(fi, 4.2));
    float dir = mod(fi, 2.0) * 2.0 - 1.0;
    float ang = fi * 0.9 + uTime * (0.012 + 0.01 * hh) * dir;
    float rx = R * (1.5 + 0.5 * hh) * (1.0 - 0.1 * uHover);
    float ry = R * (0.55 + 0.45 * h21(vec2(fi, 9.1))) * (1.0 - 0.1 * uHover);
    vec2 c = C + rot(-0.22) * vec2(cos(ang) * rx, sin(ang) * ry) + vec2(0.0, 0.006 * sin(uTime * 0.3 + fi));
    float sz = R * (0.018 + 0.03 * h21(vec2(fi, 1.7)));
    float spin = uTime * 0.05 * (hh - 0.5) + fi;
    mat2 rm = rot(spin);
    mat2 rm2 = rot(spin + 0.7 + hh);
    vec2 lp = p - c;
    /* two boxes at an angle to each other make an irregular stone */
    float d = max(sdBox(rm * lp, vec2(sz, sz * 0.62)), sdBox(rm2 * lp, vec2(sz * 0.8, sz * 0.75)));
    if (d < 0.003) {
      vec2 toC = normalize(C - c);
      float inside = smoothstep(0.0012, -0.0012, d);
      vec2 lp2 = lp + toC * sz * 0.45;
      float dTo = max(sdBox(rm * lp2, vec2(sz, sz * 0.62)), sdBox(rm2 * lp2, vec2(sz * 0.8, sz * 0.75)));
      float rim = inside * smoothstep(-0.001, 0.003, dTo);
      /* a face towards the moon, a face in shadow */
      float facet = step(0.0, dot(rm * lp, normalize(vec2(-0.5, 0.8 + hh))));
      vec3 rc = mix(vec3(0.016, 0.02, 0.034), vec3(0.06, 0.07, 0.1), facet);
      rc += vec3(0.45, 0.85, 0.8) * rim * (0.55 + 0.7 * uHover) * on(0.5, 0.85);
      col = mix(col, rc, inside * on(0.3, 0.6));
    }
  }
  return col;
}

/* The cables the ring hangs from: to the stack's shoulder, and twice to the cliff. */
float cable(vec2 p, vec2 a, vec2 b, float sag) {
  vec2 lo = min(a, b) - vec2(0.01, sag + 0.01), hi = max(a, b) + vec2(0.01);
  if (p.x < lo.x || p.x > hi.x || p.y < lo.y || p.y > hi.y) return 1.0;
  vec2 m = mix(a, b, 0.5) - vec2(0.0, sag);
  float d = 1.0;
  vec2 prev = a;
  for (int i = 1; i <= 6; i++) {
    float t = float(i) / 6.0;
    vec2 c = mix(mix(a, m, t), mix(m, b, t), t);
    d = min(d, sdSeg(p, prev, c));
    prev = c;
  }
  return d;
}
vec3 cables(vec2 p, vec3 col) {
  vec2 C = uPortal.xy;
  float R = uPortal.z;
  float narrow = uCliff.w;
  vec2 ringL = C + R * 1.0 * vec2(cos(2.55), sin(2.55));
  vec2 ringR = C + R * 1.0 * vec2(cos(0.62), sin(0.62));
  vec2 ringR2 = C + R * 1.0 * vec2(cos(-0.3), sin(-0.3));
  vec2 sTop = vec2(uCliff.y + 0.008, uCliff.z - 0.004);
  vec2 cTop = vec2(uCliff.x + 0.004 - 0.045 * smoothstep(-0.25, 0.5, 0.39), 0.39);
  vec2 cLow = vec2(uCliff.x + 0.004 - 0.045 * smoothstep(-0.25, 0.5, 0.02), 0.02);
  float d = min(cable(p, sTop, ringL, 0.04), cable(p, ringR, cTop, 0.03));
  d = min(d, cable(p, ringR2, cLow, 0.035));
  float m = smoothstep(0.0022, 0.0008, d);
  float fade = on(0.35, 0.7) * (1.0 - smoothstep(0.15, 0.45, gS));
  return mix(col, vec3(0.012, 0.015, 0.024), m * fade) + vec3(0.4, 0.5, 0.6) * smoothstep(0.0012, 0.0, d) * 0.06 * fade;
}

/* The cliffs in the foreground: a wall that leans in over the water, with ledges
   and a few lit openings cut into it. side +1 puts the rock to the right of x0. */
vec3 wall(vec2 p, vec3 col, float x0, float side) {
  /* nothing to do this far from the cliff: its outline never reaches past here */
  if ((p.x - x0) * side < -0.23) return col;
  float y = p.y;
  /* the outline: broad buttresses stepping out towards the base, an overhang at the top */
  float big = fbm3(vec2(y * 1.7, 2.0 + side * 3.0));
  float blocks = floor(big * 7.0) / 7.0;
  float jag = 0.08 * (mix(big, blocks, 0.6) - 0.5) + 0.02 * (fbm3(vec2(y * 9.0, 5.0 + side)) - 0.5) + 0.005 * (vn(vec2(y * 70.0, 1.0)) - 0.5);
  float base = 0.11 * smoothstep(0.05, -0.5, y);
  float over = 0.05 * smoothstep(0.15, 0.5, y);
  float edge = x0 - side * (base + over) + side * jag;
  float dIn = (p.x - edge) * side;
  if (dIn < -0.003) return col;
  float m = smoothstep(-0.0015, 0.0015, dIn);
  float tex = fbm3(p * vec2(9.0, 3.5) + side);
  vec3 stone = vec3(0.011, 0.014, 0.022) + vec3(0.024, 0.026, 0.034) * tex;
  /* crevices running down the face, and a few ledges */
  stone *= 0.65 + 0.35 * smoothstep(0.02, 0.12, abs(fract(p.x * 9.0 + tex * 1.6) - 0.5));
  /* the tops of the buttresses catch the moon */
  float shelf = smoothstep(0.012, 0.0, abs(fract(big * 7.0) - 0.04)) * smoothstep(0.03, 0.0, dIn);
  stone += vec3(0.3, 0.36, 0.5) * shelf * 0.18;
  /* a handful of lit openings: somebody lives in the cliff */
  vec2 wc = vec2(p.x * 110.0, y * 34.0);
  vec2 wf = fract(wc) - 0.5;
  float win = step(0.978, h21(floor(wc) + side * 13.0)) * step(abs(wf.x), 0.16) * step(abs(wf.y), 0.11) * step(0.014, dIn) * step(dIn, 0.08) * step(-0.25, y) * step(y, 0.44);
  stone += vec3(1.0, 0.78, 0.5) * win * 0.75 * on(0.55, 0.9);
  stone += vec3(0.4, 0.75, 0.72) * exp(-max(dIn, 0.0) / 0.0045) * 0.4 * on(0.45, 0.8) * (0.8 + 0.5 * uHover);
  return mix(col, stone, m);
}
vec3 lowRock(vec2 p, vec3 col) {
  if (p.y > -0.2) return col;
  float hA = 0.5 * A();
  float x = p.x;
  float narrow = uCliff.w;
  float lh = -0.5 + (narrow > 0.5 ? 0.2 : 0.25) * (1.0 - smoothstep(-hA, -hA + 0.62 * A() * (0.6 + 0.4 * narrow), x));
  lh += 0.035 * (fbm3(vec2(x * 6.0, 1.0)) - 0.5) + 0.01 * (vn(vec2(x * 45.0, 2.0)) - 0.5);
  float left = smoothstep(lh + 0.0015, lh - 0.0015, p.y);
  float rimL = exp(-max(lh - p.y, 0.0) / 0.003) * left;
  vec3 stone = vec3(0.012, 0.014, 0.022) + vec3(0.02, 0.022, 0.03) * fbm3(p * vec2(18.0, 9.0));
  col = mix(col, stone, left);
  return col + vec3(0.35, 0.42, 0.6) * rimL * 0.3;
}

vec3 threshold(vec2 p) {
  vec3 glow;
  vec4 rg = ring(p, gO, 0.0, glow);
  vec3 col = rg.rgb;
  if (rg.a < 1.0) {
    vec3 bg = p.y >= uHz ? above(p, 1.0) : figure(p, sea(p));
    col = mix(bg, rg.rgb, rg.a);
  }
  col += glow;
  if (gS < 0.97) {
    col = shards(at(p, 0.98), col);
    col = cables(at(p, 0.93), col);
  }
  if (gS < 0.79) col = stack(at(p, 0.8), col, 0.0);

  if (gS < 0.54) {
    vec2 pc = at(p, 0.55);
    col = wall(pc, col, uCliff.x, 1.0);
    col = wall(pc, col, uCliff.w > 0.5 ? -uCliff.x : -0.5 * A() + 0.07, -1.0);
    col = lowRock(at(p, 0.5), col);
  }
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float e = uTravel;
  gO = uPortal.xy - vec2(0.0, uHz);
  gS = (1.0 + DEPTH) * e;
  float lat = 1.0 - smoothstep(0.05, 0.9, gS);
  gM = gO * (1.0 - lat) + uMouse * vec2(0.012, 0.008) * (1.0 - e);
  /* Two programs are built from this source. Past the ring the page uses one that
     draws only the world beyond: a branch on a uniform is not always skipped
     (software renderers run both sides), so the field, where people spend most
     of their time, does not pay for a threshold it cannot see. */
#ifdef BEYOND_ONLY
  vec3 col = beyond(p, 1.0);
#else
  vec3 col = threshold(p);
#endif
  col += uFlash * vec3(0.9, 0.95, 1.0);
  /* atmosphere first: everything fades up from black in the opening seconds */
  col *= smoothstep(0.0, 0.3, uIntro);
  col = 1.0 - exp(-col * 1.35);
  col = pow(col, vec3(0.96));
  vec2 uv = gl_FragCoord.xy / uRes;
  col *= 0.75 + 0.25 * smoothstep(1.1, 0.35, length((uv - 0.5) * vec2(1.25, 1.0)));
  col += (h21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * 0.018;
  gl_FragColor = vec4(col, 1.0);
}`;

export { EYE, DIAL_SPEED, sceneLayout, dialAt, dialRing, toScreen, moonPhase, phaseName } from './scene.js';

export function createSky(canvas, { reduced = false, lowPower = false } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('sky shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const vs = shader(gl.VERTEX_SHADER, VERT);
  if (!vs) return null;

  /* the city, drawn once in 2D and uploaded */
  const cityArt = buildCity(512, 1);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cityArt.canvas);

  const NAMES = ['uRes', 'uTime', 'uIntro', 'uTravel', 'uHover', 'uAlt', 'uMoon', 'uLamp', 'uAccentAmt', 'uFlash', 'uMouse', 'uPortal',
    'uHz', 'uCliff', 'uMoonA', 'uFar', 'uAccent', 'uTint', 'uEnvA', 'uEnvB', 'uFocus', 'uSeen', 'uDialRot', 'uDialHot', 'uCity', 'uCityA'];
  function program(mode) {
    const fs = shader(gl.FRAGMENT_SHADER, FRAG(lowPower ? 3 : 5, mode));
    if (!fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('sky link:', gl.getProgramInfoLog(prog)); return null; }
    const U = {};
    for (const n of NAMES) U[n] = gl.getUniformLocation(prog, n);
    /* set its sampler, then put back whichever program was in use */
    const prev = gl.getParameter(gl.CURRENT_PROGRAM);
    gl.useProgram(prog);
    gl.uniform1i(U.uCity, 0);
    gl.uniform1f(U.uCityA, cityArt.canvas.height / cityArt.canvas.width);
    if (prev) gl.useProgram(prev);
    return { prog, fs, U };
  }
  const near = program('threshold');
  if (!near) return null;
  /* the lighter one for past the ring, built a moment after the first frame */
  let far = null;
  const buildFar = () => { if (!far) far = program('beyond') ?? near; return far; };
  let active = near;
  gl.useProgram(near.prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  setTimeout(buildFar, 1500);

  /* Targets are set by the page; the values drawn chase them, so nothing jumps. */
  const target = {
    intro: reduced ? 1 : 0, travel: 0, hover: 0, alt: 0, lamp: 0, accentAmt: 0, flash: 0, mouse: [0, 0],
    accent: [0.6, 0.9, 0.82], tint: [1, 1, 1], env: [0, 0, 0, 0, 0, 0, 0, 0], focus: [0, 0, 0],
    seen: [0, 0], dialHot: -1,
  };
  const now = { ...target, mouse: [0, 0], accent: [...target.accent], tint: [1, 1, 1], env: [...target.env], focus: [...target.focus] };
  let dialRot = 0;
  let scale = lowPower ? 0.45 : 0.62;
  const minScale = 0.32;
  let W = 0, H = 0, layout = null, raf = 0, last = 0, t0 = performance.now(), visible = true, alive = true;
  const stats = { fps: 0, frameMs: 0, scale, px: 0, quality: lowPower ? 'low' : 'high', renderer: '' };
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    stats.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { stats.renderer = 'unknown'; }
  let frames = 0, fpsT = performance.now(), slow = 0, sampled = 0;

  function resize() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.max(2, Math.round(W * scale));
    canvas.height = Math.max(2, Math.round(H * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    layout = sceneLayout(W, H);
    stats.px = canvas.width * canvas.height;
    stats.scale = scale;
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  function draw(ts) {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0);
    const gap = last ? ts - last : 0;
    last = ts;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    for (const key of ['intro', 'hover', 'alt', 'lamp', 'accentAmt']) now[key] = lerp(now[key], target[key], key === 'intro' ? 1 : k);
    now.travel = target.travel;
    now.flash = lerp(now.flash, target.flash, reduced ? 1 : 1 - Math.exp(-dt * 9));
    for (let i = 0; i < 2; i++) now.mouse[i] = lerp(now.mouse[i], target.mouse[i], reduced ? 0 : 1 - Math.exp(-dt * 2.5));
    const slowK = reduced ? 1 : 1 - Math.exp(-dt * 1.5);
    for (let i = 0; i < 3; i++) { now.accent[i] = lerp(now.accent[i], target.accent[i], k); now.tint[i] = lerp(now.tint[i], target.tint[i], slowK); }
    for (let i = 0; i < 8; i++) now.env[i] = lerp(now.env[i], target.env[i], slowK);
    /* the focus light moves with the island, so it follows quickly; its strength eases */
    now.focus[0] = target.focus[0];
    now.focus[1] = target.focus[1];
    now.focus[2] = lerp(now.focus[2], target.focus[2], reduced ? 1 : 1 - Math.exp(-dt * 3));
    const t = reduced ? 30 : (ts - t0) / 1000;
    dialRot = reduced ? 0 : t * DIAL_SPEED;
    const L = layout;
    const P = now.travel >= 0.9995 ? buildFar() : near;
    if (P !== active) { gl.useProgram(P.prog); active = P; }
    const U = P.U;
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uIntro, now.intro);
    gl.uniform1f(U.uTravel, now.travel);
    gl.uniform1f(U.uHover, now.hover);
    gl.uniform1f(U.uAlt, now.alt);
    gl.uniform1f(U.uMoon, moonPhase());
    gl.uniform1f(U.uLamp, now.lamp);
    gl.uniform1f(U.uAccentAmt, now.accentAmt);
    gl.uniform1f(U.uFlash, now.flash);
    gl.uniform2f(U.uMouse, now.mouse[0], -now.mouse[1]);
    gl.uniform3f(U.uPortal, ...L.portal);
    gl.uniform1f(U.uHz, L.hz);
    gl.uniform4f(U.uCliff, ...L.cliff);
    gl.uniform3f(U.uMoonA, ...L.moon);
    gl.uniform3f(U.uFar, ...L.far);
    gl.uniform3f(U.uAccent, ...now.accent);
    gl.uniform3f(U.uTint, ...now.tint);
    gl.uniform4f(U.uEnvA, now.env[0], now.env[1], now.env[2], now.env[3]);
    gl.uniform4f(U.uEnvB, now.env[4], now.env[5], now.env[6], now.env[7]);
    gl.uniform3f(U.uFocus, ...now.focus);
    gl.uniform2f(U.uSeen, target.seen[0], target.seen[1]);
    gl.uniform1f(U.uDialRot, dialRot);
    gl.uniform1f(U.uDialHot, target.dialHot);
    const s0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    stats.frameMs = performance.now() - s0;
    frames++;
    if (ts - fpsT > 1000) { stats.fps = Math.round((frames * 1000) / (ts - fpsT)); frames = 0; fpsT = ts; }
    /* Hold the frame rate by asking for fewer pixels, never more, during a visit. */
    if (!reduced && gap && gap < 250 && scale > minScale) {
      sampled++;
      if (gap > 26) slow++;
      if (sampled >= 45) {
        if (slow > 30) { scale = Math.max(minScale, scale * 0.82); stats.quality = 'reduced'; resize(); }
        sampled = 0;
        slow = 0;
      }
    }
    const settling = Math.abs(now.hover - target.hover) > 0.002 || Math.abs(now.accentAmt - target.accentAmt) > 0.002 || Math.abs(now.flash - target.flash) > 0.002
      || now.env.some((v, i) => Math.abs(v - target.env[i]) > 0.002) || Math.abs(now.focus[2] - target.focus[2]) > 0.002;
    if (visible && !document.hidden && (!reduced || settling)) kick();
  }
  function kick() { if (!raf && alive) raf = requestAnimationFrame(draw); }

  const ro = new ResizeObserver(() => { resize(); last = 0; kick(); if (reduced) draw(performance.now()); });
  ro.observe(canvas);
  const onVis = () => { if (!document.hidden) { last = 0; kick(); } };
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); alive = false; });
  resize();
  kick();

  return {
    set(values) {
      for (const [k, v] of Object.entries(values)) target[k] = Array.isArray(v) ? [...v] : v;
      if (values.flash) { now.flash = values.flash; target.flash = 0; }
      kick();
    },
    setVisible(v) { visible = v; if (v) { last = 0; kick(); } },
    layout: () => layout,
    /* which world's block of the dial is under a point on the screen, or -1 */
    dialAt: (x, y) => dialAt(layout, [(x - W / 2) / H, (H / 2 - y) / H], dialRot),
    /* and where block i is now, in screen px (the dial turns slowly) */
    dialPoint: (i) => toScreen(dialPoint(layout, i, dialRot), W, H),
    size: () => [W, H],
    stats: () => ({ ...stats, intro: now.intro, travel: now.travel, alt: now.alt }),
    redraw() { last = 0; kick(); },
    /* for stills (the share image is made this way): render at a fixed fraction of the screen */
    setScale(s) { scale = s; resize(); last = 0; kick(); },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      for (const P of new Set([near, far].filter(Boolean))) { gl.deleteProgram(P.prog); gl.deleteShader(P.fs); }
      gl.deleteShader(vs);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
