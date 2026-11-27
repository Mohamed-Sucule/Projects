/* apps/murmuration/shaders.js — the flock, on the graphics card.

   Three programs, run in this order every frame:

     COUNT  draws every bird as a single point into each of three grids of
            boxes, adding up how many birds are in each box, which way they
            are going and where they are (additive blending does the sum).

     FLY    one pixel per bird. Reads the bird, reads the boxes around it at
            each size, and works out its next position and velocity: fly with
            the neighbours, close on them, do not crowd, stay over the roost,
            get away from the falcon. Or, once the light has gone, drop into
            the reeds.

     DRAW   one small bird shape per bird, built from its position and its
            heading, with wings that beat.

   The numbers come from field.js, so this and the version on the processor
   cannot drift apart. */

import { BOX, LEVELS, SEVEN, RULES, SPACE, STREAMS, ROOST, EVENING } from './field.js';
export { FALCON_SHAPE } from './field.js';

const f = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;

const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
const float BOX = ${f(BOX)};
const float PARKED = -9000.0;
float hash(float i, float s) { return fract(sin(i * 12.9898 + s * 78.233) * 43758.5453); }
`;

/* ── count ────────────────────────────────────────────────────────────── */

export const COUNT_VERT = `${COMMON}
uniform sampler2D u_pos;
uniform sampler2D u_vel;
uniform int u_side;
uniform int u_g;
uniform vec3 u_min;
out vec4 v_sum;
out vec4 v_at;
void main() {
  int i = gl_VertexID;
  ivec2 ij = ivec2(i % u_side, i / u_side);
  vec4 P = texelFetch(u_pos, ij, 0);
  vec3 V = texelFetch(u_vel, ij, 0).xyz;
  float h = BOX / float(u_g);
  vec3 q = (P.xyz - u_min) / h;
  ivec3 c = ivec3(floor(q));
  gl_PointSize = 1.0;
  if (P.y < PARKED * 0.5 || any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, ivec3(u_g)))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  /* The boxes are laid out in a strip: each horizontal slice of the cube next to the last. */
  vec2 texel = vec2(float(c.x + c.z * u_g) + 0.5, float(c.y) + 0.5);
  vec2 size = vec2(float(u_g * u_g), float(u_g));
  gl_Position = vec4(texel / size * 2.0 - 1.0, 0.0, 1.0);
  /* Kept small, so half-precision sums stay exact enough: velocity in units
     of 200 a second, position from the box's middle in units of a box. */
  v_sum = vec4(V / 200.0, 1.0);
  v_at = vec4(q - vec3(c) - 0.5, 0.0);
}`;

export const COUNT_FRAG = `${COMMON}
in vec4 v_sum;
in vec4 v_at;
layout(location = 0) out vec4 o_sum;
layout(location = 1) out vec4 o_at;
void main() { o_sum = v_sum; o_at = v_at; }`;

/* ── fly ──────────────────────────────────────────────────────────────── */

export const QUAD_VERT = `${COMMON}
const vec2 CORNERS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(CORNERS[gl_VertexID], 0.0, 1.0); }`;

export const FLY_FRAG = `${COMMON}
uniform sampler2D u_pos;
uniform sampler2D u_vel;
uniform sampler2D u_sum0; uniform sampler2D u_at0;
uniform sampler2D u_sum1; uniform sampler2D u_at1;
uniform sampler2D u_sum2; uniform sampler2D u_at2;
uniform int u_side;
uniform vec3 u_min;
uniform vec3 u_centre;
uniform vec3 u_radii;
uniform float u_t;
uniform float u_before;
uniform float u_dt;
uniform float u_down;
uniform vec4 u_falcon; // where it is, and how far it reaches (0: no falcon)
layout(location = 0) out vec4 o_pos;
layout(location = 1) out vec4 o_vel;

const vec3 STREAMS[${STREAMS.length}] = vec3[${STREAMS.length}](${STREAMS.map(v3).join(', ')});

float arrival(float rank) {
  return rank < ${f(EVENING.early)} ? 0.0 : (rank - ${f(EVENING.early)}) / ${f(1 - EVENING.early)} * ${f(EVENING.arrive)};
}

/* What a bird sees at one size of box: the birds in the eight boxes around
   it, each weighted by how near its middle is, not counting itself. */
vec4 look(sampler2D sums, sampler2D ats, int g, vec3 p, vec3 v, out vec3 where) {
  float h = BOX / float(g);
  vec3 q = (p - u_min) / h - 0.5;
  vec3 b = floor(q);
  vec3 fr = q - b;
  ivec3 own = ivec3(floor((p - u_min) / h));
  float n = 0.0;
  vec3 sv = vec3(0.0);
  vec3 sp = vec3(0.0);
  for (int k = 0; k < 8; k++) {
    ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    ivec3 c = ivec3(b) + o;
    if (any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, ivec3(g)))) continue;
    vec3 wv = mix(1.0 - fr, fr, vec3(o));
    float w = wv.x * wv.y * wv.z;
    ivec2 t = ivec2(c.x + c.z * g, c.y);
    vec4 s = texelFetch(sums, t, 0);
    vec3 a = texelFetch(ats, t, 0).xyz;
    float self = all(equal(c, own)) ? 1.0 : 0.0;
    vec3 middle = u_min + (vec3(c) + 0.5) * h;
    n += w * (s.w - self);
    sv += w * (s.xyz * 200.0 - self * v);
    sp += w * (a * h + s.w * middle - self * p);
  }
  if (n < 0.5) { where = p; return vec4(v, n); }
  where = sp / n;
  return vec4(sv / n, n);
}

void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  float id = float(ij.y * u_side + ij.x);
  vec4 P = texelFetch(u_pos, ij, 0);
  vec4 V = texelFetch(u_vel, ij, 0);
  float rank = P.w;
  vec3 p = P.xyz;
  vec3 v = V.xyz;
  float wing = V.w;

  float at = arrival(rank);
  if (u_t < at) { o_pos = vec4(0.0, PARKED, 0.0, rank); o_vel = vec4(0.0, 0.0, 0.0, wing); return; }
  if (u_before < at) {
    /* Arriving: in from out of sight, along one of the streams. */
    vec3 s = STREAMS[int(hash(id, 3.0) * ${f(STREAMS.length)}) % ${STREAMS.length}];
    p = s + (vec3(hash(id, 4.0), hash(id, 5.0), hash(id, 6.0)) - 0.5) * vec3(90.0, 60.0, 90.0);
    v = normalize(u_centre - p) * 150.0;
  }
  if (p.y < PARKED * 0.5) { o_pos = P; o_vel = V; return; } // asleep in the reeds

  vec3 acc = vec3(0.0);
  bool down = hash(id, 9.0) < u_down;
  float flap = 0.0;
  if (down) {
    vec3 target = vec3(${f(ROOST.x)} + (hash(id, 11.0) - 0.5) * ${f(ROOST.spread)}, ${f(ROOST.y)}, ${f(ROOST.z)} + (hash(id, 13.0) - 0.5) * 200.0);
    acc = (normalize(target - p) * 175.0 - v) * 2.2;
    flap = 1.0;
  } else {
    vec3 p0, p1, p2;
    vec4 a0 = look(u_sum0, u_at0, ${LEVELS[0]}, p, v, p0);
    vec4 a1 = look(u_sum1, u_at1, ${LEVELS[1]}, p, v, p1);
    vec4 a2 = look(u_sum2, u_at2, ${LEVELS[2]}, p, v, p2);
    /* About seven neighbours: the finest boxes that hold that many. */
    float k0 = smoothstep(3.0, ${f(SEVEN + 1)}, a0.w);
    float k1 = smoothstep(3.0, ${f(SEVEN + 1)}, a1.w);
    vec3 vm = mix(mix(a2.xyz, a1.xyz, k1), a0.xyz, k0);
    vec3 pm = mix(mix(p2, p1, k1), p0, k0);
    acc += (vm - v) * ${f(RULES.align)};
    /* A bird on the edge has few close by: it closes in harder, which is
       what gives a murmuration its sharp outline. */
    acc += (pm - p) * (${f(RULES.cohere)} + ${f(RULES.edge)} * (1.0 - k0));
    if (a0.w > ${f(RULES.crowd)}) acc += (p - p0) * ${f(RULES.press)} * (a0.w - ${f(RULES.crowd)}) / ${f(RULES.crowd)};
    /* Stay over the roost: free inside the flock's space, pulled back outside it. */
    vec3 o = (p - u_centre) / u_radii;
    float out_ = length(o);
    if (out_ > 1.0) acc -= o * u_radii * ((out_ - 1.0) / out_) * ${f(RULES.pull)} * vec3(1.0, 1.3, 1.0);
    /* Not down into the reeds until it is time. */
    if (p.y < ${f(SPACE.floor)}) acc.y += (${f(SPACE.floor)} - p.y) * 6.0;
    if (u_falcon.w > 0.0) {
      vec3 e = p - u_falcon.xyz;
      float d = max(1.0, length(e));
      if (d < u_falcon.w) { acc += e / d * ${f(RULES.flee)} * (1.0 - d / u_falcon.w); flap = 1.0; }
    }
    float tick = floor(u_t * 60.0);
    acc += (vec3(hash(id, tick), hash(id, tick + 0.31), hash(id, tick + 0.67)) - 0.5) * ${f(RULES.noise)} * 2.0;
    float sp = max(1.0, length(v));
    acc += v / sp * (${f(RULES.cruise)} - sp) * 1.3;
  }
  v += acc * u_dt;
  float sp = max(1.0, length(v));
  v *= clamp(sp, ${f(RULES.slowest)}, ${f(RULES.fastest)}) / sp;
  p += v * u_dt;
  /* Flap and glide, each bird in bursts of its own; flap hard when chased. */
  bool beating = flap > 0.0 || sin(u_t * 0.9 + rank * 80.0) > -0.3;
  wing += u_dt * (beating ? 25.0 : 2.0);
  if (down && p.y < ${f(ROOST.y + 18)}) p = vec3(0.0, PARKED, 0.0);
  o_pos = vec4(p, rank);
  o_vel = vec4(v, mod(wing, 6.2831853));
}`;

/* ── draw ─────────────────────────────────────────────────────────────── */

/* A starling seen from below, in its own frame: x to the right wing, z
   forward. Four triangles: the body, the tail, two wings. */
export const BIRD = new Float32Array([
  // x, y, z, wing (-1 left, 0 body, 1 right)
  0, 0, 1.0, 0, -0.2, 0, -0.15, 0, 0.2, 0, -0.15, 0,
  -0.26, 0, -1.0, 0, 0.26, 0, -1.0, 0, 0, 0, -0.1, 0,
  -0.16, 0, 0.38, -1, -0.16, 0, -0.26, -1, -1.65, 0, -0.42, -1,
  0.16, 0, 0.38, 1, 1.65, 0, -0.42, 1, 0.16, 0, -0.26, 1,
]);

export const DRAW_VERT = `${COMMON}
layout(location = 0) in vec4 a_shape;
uniform sampler2D u_pos;
uniform sampler2D u_vel;
uniform int u_side;
uniform mat4 u_viewProj;
uniform float u_pixels; // pixels per unit, one unit in front of the eye
uniform float u_size;
out float v_far;
void main() {
  int i = gl_InstanceID;
  ivec2 ij = ivec2(i % u_side, i / u_side);
  vec4 P = texelFetch(u_pos, ij, 0);
  vec4 V = texelFetch(u_vel, ij, 0);
  if (P.y < PARKED * 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 fwd = normalize(V.xyz + vec3(0.0, 0.0, 0.0001));
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)) + vec3(0.00001));
  vec3 up = cross(right, fwd);
  vec3 l = a_shape.xyz;
  if (a_shape.w != 0.0) {
    float beat = sin(V.w) * 0.8;
    float reach = abs(l.x);
    l.y = sin(beat) * reach;
    l.x = sign(l.x) * cos(beat) * reach;
  }
  vec4 middle = u_viewProj * vec4(P.xyz, 1.0);
  /* Never smaller than a pixel and a half across, or the far birds flicker out. */
  float across = u_pixels / middle.w * 3.3 * u_size;
  float grow = max(1.0, 1.5 / across);
  vec3 w = P.xyz + (right * l.x + up * l.y + fwd * l.z) * u_size * grow;
  gl_Position = u_viewProj * vec4(w, 1.0);
  v_far = clamp((middle.w - 650.0) / 1500.0, 0.0, 1.0);
}`;

export const DRAW_FRAG = `${COMMON}
in float v_far;
uniform vec3 u_ink;
uniform vec3 u_haze;
out vec4 o;
void main() {
  /* Far birds fade a little into the haze, so the flock has depth. */
  float a = 0.94 - v_far * 0.32;
  vec3 c = mix(u_ink, u_haze, v_far * 0.5);
  o = vec4(c * a, a);
}`;

/* The falcon: one bird, from uniforms rather than textures, with jointed
   wings. The same sums as articulate() in field.js. */
export const FALCON_VERT = `${COMMON}
layout(location = 0) in vec4 a_shape;
uniform vec3 u_p;
uniform vec3 u_fwd;
uniform float u_bank;
uniform float u_beat;
uniform float u_tuck;
uniform float u_size;
uniform mat4 u_viewProj;
out float v_far;
const float SHOULDER = 0.17;
const float WRIST = 0.96;
void main() {
  vec3 l = a_shape.xyz;
  if (a_shape.w > 0.5) {
    float s = l.x < 0.0 ? -1.0 : 1.0;
    float ax = abs(l.x);
    float a1 = u_beat * 0.55 + 0.07;
    float a2 = a1 + u_beat * 0.35;
    float px, py;
    if (a_shape.w < 1.5) { px = SHOULDER + (ax - SHOULDER) * cos(a1); py = (ax - SHOULDER) * sin(a1); }
    else { px = SHOULDER + (WRIST - SHOULDER) * cos(a1) + (ax - WRIST) * cos(a2); py = (WRIST - SHOULDER) * sin(a1) + (ax - WRIST) * sin(a2); }
    float sweep = 0.1 + u_tuck;
    float o = px - SHOULDER;
    l = vec3(s * (SHOULDER + o * cos(sweep)), py, l.z - o * sin(sweep));
  }
  vec3 fwd = normalize(u_fwd);
  vec3 r0 = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)) + vec3(0.00001));
  vec3 u0 = cross(r0, fwd);
  vec3 right = r0 * cos(u_bank) + u0 * sin(u_bank);
  vec3 up = -r0 * sin(u_bank) + u0 * cos(u_bank);
  vec4 middle = u_viewProj * vec4(u_p, 1.0);
  gl_Position = u_viewProj * vec4(u_p + (right * l.x + up * l.y + fwd * l.z) * u_size, 1.0);
  v_far = clamp((middle.w - 650.0) / 1500.0, 0.0, 1.0) * 0.6;
}`;
