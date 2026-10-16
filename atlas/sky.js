/* atlas/sky.js — the world behind the page, in one fragment shader.

   Two places share this canvas. The threshold: a black sea under a night sky,
   rock walls in the foreground, structures standing in the fog, two moons, and
   an immense ring standing in the water with a person in its doorway. And the
   world beyond it: a floating city above a sea of clouds, at dawn, which is
   where the islands live. Scrolling down the page carries the camera through the
   ring (uTravel), and the rest of the page's scroll lowers it towards the clouds
   (uAlt).

   Everything is computed per pixel: no meshes, no image files. The one texture
   is the floating city, drawn once with the 2D canvas (hero.js) and uploaded.
   The sea is the sky evaluated a second time, upside down and pushed about by
   two layers of moving noise; the portal's opening is the beyond-world drawn
   into a circle, which is why stepping through it is continuous.

   It renders below screen resolution and adjusts that resolution to hold its
   frame rate; off screen, in a background tab or with reduced motion it stops
   drawing. If WebGL is missing or the shader will not compile, createSky
   returns null and the page falls back to the 2D canvas world. */

import { buildCity } from './hero.js';

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = (oct) => `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uIntro, uTravel, uHover, uAlt, uMoon, uLamp, uAccentAmt, uFlash;
uniform vec2 uMouse;
uniform vec3 uPortal;      // centre x, centre y, outer radius (scene units: y spans -0.5..0.5)
uniform float uHz;         // horizon height
uniform vec4 uRock;        // right rock width, right rock top, left rock height, narrow (0/1)
uniform vec3 uMoonA;       // big moon x, y, radius
uniform vec3 uAccent, uTint;
uniform vec2 uLight;       // lighthouse x, y
uniform sampler2D uCity;
uniform float uCityA;      // city texture height / width
#define OCT ${oct}

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

/* ── the world beyond the portal ─────────────────────────────────────── */

vec4 city(vec2 q, vec2 at, float h) {
  vec2 uv = vec2((q.x - at.x) / (h / uCityA) + 0.5, 1.0 - ((q.y - at.y) / h + 0.5));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uCity, uv);
}

vec3 beyond(vec2 q, float full) {
  float hb = mix(-0.11, -0.04 + uAlt * 0.22, full);
  float t = q.y - hb;
  vec3 tint = mix(vec3(1.0), uTint, full);
  vec3 top = vec3(0.035, 0.055, 0.14) * tint;
  vec3 midc = vec3(0.17, 0.25, 0.42) * tint;
  vec3 hor = vec3(1.0, 0.8, 0.6) * mix(vec3(1.0), tint, 0.45);
  vec2 sun = vec2(-0.05 + 0.25 * full, hb + 0.045);
  vec3 col;
  if (t > 0.0) {
    col = mix(hor, midc, smoothstep(0.0, 0.16, t));
    col = mix(col, top, smoothstep(0.12, 0.55, t));
    float sd = length((q - sun) * vec2(1.0, 2.0));
    col += vec3(1.0, 0.8, 0.58) * (0.55 * exp(-sd * 7.0) + 0.25 * exp(-sd * 2.2));
    /* light breaking past the sun in faint rays */
    float ang = atan(q.y - sun.y, q.x - sun.x);
    col += vec3(1.0, 0.85, 0.65) * pow(vn(vec2(ang * 18.0, uTime * 0.05)), 4.0) * exp(-sd * 4.0) * 0.07;
    /* cumulus towers on the horizon, lit on the sun's side */
    float c = fbm3(vec2(q.x * 2.6 + uTime * 0.005, t * 7.5 - 0.3));
    float tower = smoothstep(0.42, 0.56, c - t * 2.2);
    float sunSide = 0.5 + 0.5 * clamp((sun.x - q.x) * -4.0, -1.0, 1.0);
    vec3 towerCol = mix(vec3(0.42, 0.42, 0.6), vec3(1.0, 0.86, 0.72), mix(c, sunSide, 0.4)) * tint;
    col = mix(col, towerCol, tower * 0.75);
    vec2 m = q - vec2(0.42 - 0.2 * full, hb + 0.3);
    col += vec3(0.95) * smoothstep(0.02, 0.016, length(m)) * 0.3;
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
    vec3 valley = vec3(0.11, 0.14, 0.27) * tint;
    vec3 body = vec3(0.52, 0.52, 0.68) * tint;
    vec3 crest = vec3(1.0, 0.86, 0.72) * mix(vec3(1.0), tint, 0.35);
    col = mix(valley, body, dens);
    col = mix(col, crest, dens * lightEdge * 0.85);
    float haze = exp(-k * 9.0);
    col = mix(col, hor * 0.92, haze * 0.85);
    col += vec3(1.0, 0.78, 0.55) * 0.22 * exp(-length((q - vec2(sun.x, hb)) * vec2(0.7, 7.0)) * 3.5);
  }
  vec2 at = mix(vec2(0.02, hb + 0.19), vec2(0.30 * A() - 0.05, hb + 0.13 + uAlt * 0.05), full);
  float ch = mix(0.6, 0.3, full);
  vec4 cty = city(q - vec2(0.0, sin(uTime * 0.4) * 0.006), at, ch);
  col = mix(col, cty.rgb * mix(vec3(0.85, 0.82, 1.0), tint, 0.4) + vec3(0.06, 0.05, 0.04), cty.a * 0.96);
  col = mix(col, col * (0.75 + uAccent * 0.6) + uAccent * 0.05, uAccentAmt * 0.6);
  return col;
}

/* ── the threshold ────────────────────────────────────────────────────── */

vec3 sky(vec2 p, float full) {
  float hz = uHz;
  float t = clamp((p.y - hz) / (0.5 - hz), 0.0, 1.0);
  vec3 col = mix(vec3(0.15, 0.19, 0.31), vec3(0.06, 0.09, 0.17), smoothstep(0.0, 0.35, t));
  col = mix(col, vec3(0.018, 0.026, 0.052), smoothstep(0.3, 1.0, t));
  float d = length(p - uPortal.xy);
  col += vec3(0.25, 0.48, 0.47) * 0.26 * exp(-max(d - uPortal.z, 0.0) * 4.5) * on(0.4, 0.85) * (0.85 + 0.5 * uHover);
  col += vec3(0.91, 0.78, 0.67) * 0.07 * exp(-abs(p.y - hz) * 16.0);
  if (full > 0.5) {
    float n = fbm(p * 2.1 + vec2(uTime * 0.004, 0.0));
    col += vec3(0.44, 0.56, 0.78) * pow(n, 3.2) * 0.42 * smoothstep(hz + 0.04, 0.5, p.y);
    /* stars, fewer and dimmer towards the horizon */
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
  float a = uMoon * 6.2831853;
  vec3 L = normalize(vec3(sin(a), 0.12, -cos(a)));
  float lit = smoothstep(-0.06, 0.22, dot(n, L));
  float crater = fbm3(q * 2.6 + c * 17.0);
  vec3 base = mix(vec3(0.55, 0.56, 0.62), vec3(0.97, 0.92, 0.86), crater);
  vec3 col = base * lit + vec3(0.035, 0.045, 0.07);
  float disk = smoothstep(1.0, 0.95, rr);
  float halo = exp(-max(rr - 1.0, 0.0) * 2.2) * 0.22 * (0.2 + 0.8 * abs(cos(a * 0.5))) * (1.0 - disk);
  return vec4(col * disk + vec3(0.75, 0.8, 0.95) * halo, max(disk, halo));
}

/* Mesas and a broken megastructure, far off and mostly fog. */
vec3 far(vec2 p, vec3 col) {
  float hz = uHz;
  if (p.y < hz || p.y > hz + 0.36) return col;
  float fog = on(0.18, 0.55);
  vec3 haze = vec3(0.16, 0.2, 0.32);
  float h1 = max(0.0, 0.07 * pow(fbm3(vec2(p.x * 2.4, 7.3)), 2.0) - 0.012);
  float m1 = smoothstep(hz + h1 + 0.0015, hz + h1, p.y);
  col = mix(col, mix(haze, vec3(0.1, 0.13, 0.22), 0.35), m1 * fog * 0.7);
  float n = vn(vec2(p.x * 3.4 + 11.0, 2.0));
  float h2 = max(0.0, 0.05 * pow(n, 3.0) - 0.006);
  h2 = mix(h2, floor(h2 * 160.0) / 160.0, step(0.55, n));
  float m2 = smoothstep(hz + h2 + 0.0012, hz + h2, p.y);
  col = mix(col, vec3(0.05, 0.07, 0.12), m2 * fog * 0.85);
  /* the arch: an enormous ring fragment standing on the horizon, broken */
  vec2 M = vec2(-0.40 * A(), hz - 0.05);
  float rm = 0.33;
  vec2 dm = p - M;
  float ang = atan(dm.y, dm.x);
  float band = smoothstep(0.009, 0.006, abs(length(dm) - rm)) * step(0.32, ang) * step(ang, 2.6);
  band *= step(0.12, fract(ang * 2.3 + 0.2));
  col = mix(col, vec3(0.09, 0.11, 0.18), band * fog * 0.8);
  /* a needle tower and its warning light */
  vec2 tw = vec2(-0.12 * A(), hz);
  float needle = step(abs(p.x - tw.x), 0.0022 * (1.0 - (p.y - hz) / 0.21)) * step(p.y, hz + 0.21);
  col = mix(col, vec3(0.08, 0.1, 0.16), needle * fog * 0.9);
  float blink = step(0.5, fract(uTime * 0.45));
  col += vec3(1.0, 0.45, 0.35) * exp(-length(p - vec2(tw.x, hz + 0.212)) * 900.0) * blink * fog * 2.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 lp = M + rm * vec2(cos(0.6 + fi * 0.75), sin(0.6 + fi * 0.75));
    col += vec3(0.6, 0.9, 0.85) * exp(-length(p - lp) * 1200.0) * (0.5 + 0.5 * sin(uTime * 1.3 + fi * 2.0)) * fog;
  }
  /* the lighthouse on its far rock: dark until something comes near */
  vec2 lh = uLight;
  float rock = smoothstep(0.004, 0.0, abs(p.x - lh.x) - 0.016 * (1.0 - (p.y - hz) / 0.012)) * step(p.y, hz + 0.012) * step(hz, p.y);
  float tower = step(abs(p.x - lh.x), 0.0016) * step(p.y, hz + 0.03) * step(hz + 0.008, p.y);
  col = mix(col, vec3(0.05, 0.06, 0.1), max(rock, tower) * fog);
  vec2 lamp = vec2(lh.x, hz + 0.031);
  float beamA = uTime * 0.56;
  vec2 bd = p - lamp;
  float bang = abs(mod(atan(bd.y, bd.x) - beamA + 3.14159, 6.28318) - 3.14159);
  float beam = smoothstep(0.08, 0.0, bang) * exp(-length(bd) * 14.0) * step(0.0, bd.y + 0.004);
  col += vec3(1.0, 0.88, 0.6) * (exp(-length(bd) * 800.0) * (0.4 + 1.6 * uLamp) + beam * 0.8 * uLamp) * fog;
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
  vec2 at = vec2(mix(-0.75, 0.75, u) * A(), 0.36 - 0.06 * u);
  vec2 back = at - vec2(0.12, -0.012);
  vec2 pa = p - back, ba = at - back;
  float k = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float trail = exp(-length(pa - ba * k) * 1400.0) * k * k;
  float head = exp(-length(p - at) * 900.0);
  float vis = smoothstep(0.0, 0.08, u) * smoothstep(0.62, 0.5, u);
  return col + vec3(0.85, 0.95, 1.0) * (trail * 0.35 + head * 1.4) * vis;
}

/* The portal: an opening onto the world beyond, three architectural rings and a
   thin orbit of light, the whole thing tilting a little towards the cursor. */
vec3 portal(vec2 p, vec3 col, float full, float travel) {
  vec2 C = uPortal.xy;
  float R = uPortal.z;
  vec2 d2 = p - C;
  float d = length(d2);
  if (d > R * 1.35) return col;
  float a = atan(d2.y, d2.x);
  float Ri = R * 0.80;
  float lit = on(0.45, 0.8);
  float hover = uHover;
  /* the opening */
  if (d < Ri) {
    vec2 q = d2 / Ri;
    float rim = smoothstep(0.62, 1.0, length(q));
    vec2 view = q * 0.78 * (1.0 - 0.07 * rim * (1.0 + hover)) + uMouse * vec2(0.035, 0.02) * (1.0 - rim);
    vec3 b = beyond(view, 0.0);
    b *= mix(1.0, 0.55, rim * rim);
    col = mix(vec3(0.01, 0.015, 0.03), b, lit);
  }
  /* inner rim: a hairline of light, split into colours when you come close */
  vec3 ca = vec3(-1.0, 0.0, 1.0) * R * (0.004 + 0.006 * hover);
  vec3 w = vec3(R * 0.006);
  vec3 rimE = exp(-pow((vec3(d) - (Ri + ca)) / w, vec3(2.0)));
  col += rimE * vec3(1.0, 0.97, 0.92) * (1.1 + 1.6 * hover) * on(0.5, 0.75);
  /* ring one: stone panels with lit seams */
  float r1 = smoothstep(Ri * 1.004, Ri * 1.012, d) * smoothstep(R * 0.965, R * 0.955, d);
  if (r1 > 0.0) {
    float s = a / 6.2831853 * 64.0 + uTime * 0.02;
    float seam = smoothstep(0.0, 0.05, abs(fract(s) - 0.5) - 0.445);
    float groove = smoothstep(0.004, 0.0, abs(d - R * 0.88)) + smoothstep(0.003, 0.0, abs(d - R * 0.92));
    float face = 0.5 + 0.5 * dot(normalize(d2), vec2(-0.6, 0.8));
    float grain = vn(vec2(a * 40.0, d * 300.0));
    vec3 stone = mix(vec3(0.03, 0.036, 0.055), vec3(0.11, 0.12, 0.16), face) * (0.85 + 0.3 * grain);
    float breathe = 0.75 + 0.25 * sin(uTime * 0.6);
    vec3 e = vec3(0.45, 0.85, 0.78) * (seam * 0.55 + groove * 0.35) * on(0.55, 0.8) * (0.5 + 1.1 * hover) * breathe;
    col = mix(col, stone + e, r1);
  }
  /* ring two: sixteen heavy blocks with gaps, turning the other way */
  float r2 = smoothstep(R * 0.975, R * 0.985, d) * smoothstep(R * 1.13, R * 1.12, d);
  if (r2 > 0.0) {
    float b = fract(a / 6.2831853 * 16.0 - uTime * 0.004);
    float id = floor(a / 6.2831853 * 16.0 - uTime * 0.004);
    float outer = R * (1.07 + 0.05 * h21(vec2(id, 3.0)));
    float block = step(0.06, b) * step(b, 0.94) * step(d, outer);
    float glyph = step(0.42, fract(b * 6.0)) * step(abs(d - R * 1.04), R * 0.006) * step(0.3, h21(vec2(id, 7.0)));
    float face = 0.5 + 0.5 * dot(normalize(d2), vec2(-0.5, 0.86));
    vec3 stone = mix(vec3(0.03, 0.035, 0.055), vec3(0.16, 0.17, 0.22), face * face);
    vec3 e = vec3(0.91, 0.78, 0.67) * glyph * on(0.65, 0.9) * (0.7 + 0.6 * hover);
    float topEdge = smoothstep(R * 0.012, 0.0, outer - d) * max(face - 0.4, 0.0);
    col = mix(col, stone + e + vec3(0.9, 0.85, 0.8) * topEdge * 0.35, r2 * block);
  }
  /* the orbit of light, with three pulses running round it */
  float orbit = exp(-pow((d - R * 1.24) / (R * 0.004), 2.0));
  float pulses = 0.0;
  for (int i = 0; i < 3; i++) {
    float pa = uTime * 0.22 + float(i) * 2.0944;
    float dd = abs(mod(a - pa + 3.14159, 6.28318) - 3.14159);
    pulses += exp(-dd * dd * 60.0);
  }
  col += vec3(0.6, 0.9, 0.85) * orbit * (0.18 + pulses * 1.2) * on(0.7, 0.95) * (0.8 + 0.6 * hover);
  /* the person standing in the doorway, for scale */
  vec2 f = vec2(C.x + R * 0.05, C.y - Ri + R * 0.004);
  float hf = R * 0.075;
  vec2 fp = (p - f) / hf;
  float body = length(vec2(fp.x * 3.4, max(abs(fp.y - 0.55) - 0.2, 0.0) * 1.0)) - 0.17;
  float head = length(fp - vec2(0.0, 0.9)) - 0.1;
  float legs = max(abs(abs(fp.x) - 0.045) - 0.03, abs(fp.y - 0.17) - 0.17);
  float coat = max(abs(fp.x) - (0.07 + (0.55 - fp.y) * 0.12), abs(fp.y - 0.45) - 0.12);
  float figure = min(min(body, head), min(legs, coat));
  col = mix(col, vec3(0.005, 0.006, 0.01), smoothstep(0.02, -0.02, figure) * lit);
  col += vec3(0.5, 0.85, 0.8) * exp(-abs(fp.y) * 30.0) * step(abs(fp.x), 0.6) * 0.15 * lit;
  return col;
}

vec3 above(vec2 p, float full) {
  vec3 col = sky(p, full);
  vec4 m = moon(p, uMoonA.xy, uMoonA.z);
  col = mix(col, m.rgb, m.a * on(0.1, 0.4));
  vec4 m2 = moon(p, uMoonA.xy + vec2(0.13 * A(), -0.07), uMoonA.z * 0.28);
  col = mix(col, m2.rgb * 0.85, m2.a * on(0.15, 0.45));
  if (full > 0.5) {
    float wisp = fbm3(vec2(p.x * 0.9 - uTime * 0.005, p.y * 6.5));
    col = mix(col, vec3(0.22, 0.27, 0.38), smoothstep(0.55, 0.85, wisp) * smoothstep(uHz + 0.1, 0.35, p.y) * 0.35);
  }
  col = far(p, col);
  col = traveller(p, col);
  float fb = fogBand(p, full);
  float near = exp(-length(p - uPortal.xy) * 2.0);
  col = mix(col, mix(vec3(0.17, 0.22, 0.33), vec3(0.42, 0.62, 0.62), near), fb * 0.75);
  col = portal(p, col, full, 0.0);
  return col;
}

vec3 sea(vec2 p) {
  float k = uHz - p.y;
  float z = 0.12 / (k + 0.004);
  vec2 w = vec2(p.x * z, z);
  float r1 = vn(w * vec2(3.0, 1.1) + vec2(0.0, -uTime * 0.32));
  float r2 = vn(w * vec2(8.0, 2.8) + vec2(uTime * 0.18, -uTime * 0.55));
  float r3 = vn(w * vec2(22.0, 7.0) + vec2(-uTime * 0.3, -uTime * 1.1));
  float rip = (r1 - 0.5) * 0.6 + (r2 - 0.5) * 0.3 + (r3 - 0.5) * 0.25;
  vec2 rp = vec2(p.x + rip * k * 0.07, 2.0 * uHz - p.y + rip * k * 0.55 + 0.002);
  vec3 refl = above(rp, 0.0);
  float fres = mix(0.22, 0.8, exp(-k * 6.0));
  vec3 col = mix(vec3(0.006, 0.01, 0.022), refl * (0.85 + 0.3 * r3), fres);
  float streak = smoothstep(0.55, 0.95, vn(vec2(p.x * 6.0, z * 2.0 - uTime * 0.2)));
  col += vec3(0.25, 0.32, 0.45) * streak * 0.05 * exp(-k * 3.0);
  float gx = exp(-pow((p.x - uPortal.x) / (uPortal.z * 0.55), 2.0));
  float gl = smoothstep(0.64, 0.92, vn(w * vec2(14.0, 4.5) + vec2(0.0, -uTime * 0.9)));
  col += vec3(0.6, 0.9, 0.85) * gl * gx * 0.4 * (0.6 + 0.7 * uHover) * exp(-k * 1.6) * on(0.45, 0.8);
  return col;
}

/* The black rock in the foreground: a wall on the right, a shoulder on the left. */
vec3 rocks(vec2 p, vec3 col) {
  float hA = 0.5 * A();
  /* right */
  float top = uRock.y;
  float y = p.y;
  float jag = 0.03 * (fbm3(vec2(y * 7.0, 2.0)) - 0.5) + 0.012 * (vn(vec2(y * 38.0, 5.0)) - 0.5);
  float width = uRock.x * (0.32 + 0.68 * smoothstep(top, top - 0.32, y)) + jag;
  float edge = hA - width;
  float tip = top + 0.03 * (vn(vec2(p.x * 30.0, 9.0)) - 0.5);
  float right = smoothstep(edge - 0.0015, edge + 0.0015, p.x) * step(y, tip);
  float rimR = exp(-max(p.x - edge, 0.0) / 0.0035) * right * smoothstep(top, top - 0.4, y);
  /* left */
  float x = p.x;
  float lh = -0.5 + uRock.z * (1.0 - smoothstep(-hA, -hA + 0.62 * A() * (0.6 + 0.4 * uRock.w), x));
  lh += 0.035 * (fbm3(vec2(x * 6.0, 1.0)) - 0.5) + 0.01 * (vn(vec2(x * 45.0, 2.0)) - 0.5);
  float left = smoothstep(lh + 0.0015, lh - 0.0015, y);
  float rimL = exp(-max(lh - y, 0.0) / 0.003) * left;
  float m = max(right, left);
  float tex = fbm3(p * vec2(18.0, 9.0));
  vec3 stone = vec3(0.012, 0.014, 0.022) + vec3(0.02, 0.022, 0.03) * tex;
  col = mix(col, stone, m);
  col += vec3(0.4, 0.75, 0.72) * rimR * 0.5 * on(0.45, 0.8) * (0.8 + 0.4 * uHover);
  col += vec3(0.35, 0.42, 0.6) * rimL * 0.32;
  return col;
}

vec3 threshold(vec2 p) {
  vec3 col = p.y >= uHz ? above(p, 1.0) : sea(p);
  return rocks(p, col);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 C = uPortal.xy;
  float Ri = uPortal.z * 0.8;
  float e = uTravel;
  vec3 col;
  if (e <= 0.0) {
    col = threshold(p);
  } else if (e >= 1.0) {
    col = beyond(p, 1.0);
  } else {
    /* Through the ring: the near world rushes past (zoom about the portal) while
       the world beyond approaches more slowly, so the two separate in depth. */
    float z = 1.0 + 46.0 * pow(e, 2.3);
    vec2 pz = C + (p - C) / z;
    float dz = length(pz - C);
    float warp = smoothstep(Ri * 0.7, Ri * 1.3, dz) * e * (1.0 - e) * 4.0;
    pz += normalize(p - C + 1e-5) * warp * 0.02 * sin(dz * 120.0 - uTime * 8.0);
    float s = mix(Ri / 0.78, 1.0, smoothstep(0.0, 1.0, e));
    vec2 q = (p - C * (1.0 - e)) / s;
    float inside = smoothstep(Ri * 1.0, Ri * 0.97, dz);
    vec3 world = beyond(q, smoothstep(0.2, 0.95, e));
    vec3 near = threshold(pz);
    col = mix(near, world, inside);
    /* streaks of light along the direction of travel */
    float ang = atan(p.y - C.y, p.x - C.x);
    float streak = pow(vn(vec2(ang * 70.0, uTime * 2.0 + length(p - C) * 3.0)), 9.0) * smoothstep(0.05, 0.5, length(p - C)) * smoothstep(0.1, 0.4, e) * smoothstep(0.9, 0.55, e);
    col += mix(vec3(0.6, 0.9, 0.85), vec3(0.95, 0.8, 0.7), vn(vec2(ang * 9.0, 1.0))) * streak * 0.6;
  }
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

/* The geometry of the scene, in the shader's units (y from -0.5 to 0.5, x scaled
   by the aspect ratio). Kept here so the page can hit-test the portal and place
   the hidden hotspots exactly where the shader draws them. */
export function sceneLayout(W, H) {
  const a = W / H;
  const narrow = a < 0.9;
  const hz = narrow ? 0.07 : -0.13;
  const R = narrow ? Math.min(0.15, a * 0.3) : Math.min(0.235, a * 0.18);
  const cx = narrow ? 0.06 * a : 0.2 * a;
  const portal = [cx, hz + R * 0.95, R];
  return {
    a, narrow, hz, portal,
    rock: narrow ? [0.06 * a + 0.03, 0.2, 0.24, 1] : [0.16, 0.36, 0.25, 0],
    moon: narrow ? [-0.3 * a, 0.4, 0.02] : [-0.06 * a, 0.36, 0.026],
    /* on a wide screen the lighthouse stands in the gap between the headline and the ring */
    light: [narrow ? -0.3 * a : cx - R * 1.6, hz],
  };
}

/** Scene units to CSS pixels. */
export function toScreen([x, y], W, H) {
  return [x * H + W / 2, H / 2 - y * H];
}

/* The real phase of the moon today: 0 new, 0.5 full. Computed from the date,
   so the sky is a little different on each visit without anything being stored. */
export function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNew) / 86400000;
  return ((days % synodic) + synodic) % synodic / synodic;
}

export function phaseName(phase) {
  const names = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  return names[Math.round(phase * 8) % 8];
}

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
  const fs = shader(gl.FRAGMENT_SHADER, FRAG(lowPower ? 3 : 5));
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('sky link:', gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uRes', 'uTime', 'uIntro', 'uTravel', 'uHover', 'uAlt', 'uMoon', 'uLamp', 'uAccentAmt', 'uFlash', 'uMouse', 'uPortal',
    'uHz', 'uRock', 'uMoonA', 'uAccent', 'uTint', 'uLight', 'uCity', 'uCityA']) U[n] = gl.getUniformLocation(prog, n);

  /* the city, drawn once in 2D and uploaded */
  const cityArt = buildCity(512, 1);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cityArt.canvas);
  gl.uniform1i(U.uCity, 0);
  gl.uniform1f(U.uCityA, cityArt.canvas.height / cityArt.canvas.width);

  /* Targets are set by the page; the values drawn chase them, so nothing jumps. */
  const target = { intro: reduced ? 1 : 0, travel: 0, hover: 0, alt: 0, lamp: 0, accentAmt: 0, flash: 0, mouse: [0, 0], accent: [0.6, 0.9, 0.82], tint: [1, 1, 1] };
  const now = { ...target, mouse: [0, 0], accent: [...target.accent], tint: [1, 1, 1] };
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
    for (let i = 0; i < 3; i++) { now.accent[i] = lerp(now.accent[i], target.accent[i], k); now.tint[i] = lerp(now.tint[i], target.tint[i], 1 - Math.exp(-dt * 1.5)); }
    const t = reduced ? 30 : (ts - t0) / 1000;
    const L = layout;
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
    gl.uniform4f(U.uRock, ...L.rock);
    gl.uniform3f(U.uMoonA, ...L.moon);
    gl.uniform2f(U.uLight, ...L.light);
    gl.uniform3f(U.uAccent, ...now.accent);
    gl.uniform3f(U.uTint, ...now.tint);
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
    const settling = Math.abs(now.hover - target.hover) > 0.002 || Math.abs(now.accentAmt - target.accentAmt) > 0.002 || Math.abs(now.flash - target.flash) > 0.002;
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
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
