/**
 * LES PRESETS DE FOND — repris tels quels des briques de da-kit
 * (`templates/bricks/components/backgrounds/shaders.ts`, lock 23 : on part d'un template, on
 * n'ecrit pas un fond maison). Aucune dependance : c'est du GLSL, compile par le navigateur.
 *
 * Ce fichier porte les onze presets du template, PLUS un douzieme, `releve`, parce qu'aucun des
 * onze ne tient les locks 24 et 25 a la fois :
 *   - `rays` fait deriver une SOURCE LUMINEUSE avec le pointeur — lock 24 l'interdit ;
 *   - `topo` allume un bassin sous le pointeur — meme interdiction ;
 *   - `grid` donne la perspective, mais avec un ciel en degrade et des etoiles : ce n'est pas
 *     le registre d'un appareil de mesure, et Florent l'a ecarte en le voyant.
 * `releve` reprend les courbes de niveau de `topo` — les ondes — les pose sur un PLAN EN
 * PERSPECTIVE (le 3D leger du lock 25), et fait DEPLACER LE TERRAIN par le pointeur au lieu de
 * l'eclairer. On ne promene pas une lampe sur une carte, on fait glisser la carte sous soi.
 *
 * Tous recoivent : u_time (s), u_res (px), u_bg / u_c1 / u_c2 (rgb 0..1), u_mouse (0..1).
 */
export type PresetShader =
  | "aurora" | "liquid" | "grid" | "particles" | "noise" | "pixel"
  | "dither" | "rays" | "caustics" | "topo" | "halftone" | "releve";


/**
 * Fragment shader presets. All receive:
 *   u_time (s), u_res (px), u_bg / u_c1 / u_c2 (rgb 0..1), u_mouse (0..1)
 * Add a preset: write GLSL here, add its key to ShaderPreset in lib/design.ts, look at it before believing it.
 * Keep them cheap: they run full screen on phones. No loops over ~24 iterations.
 */

const common = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_bg;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec2 u_mouse;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + 10.0;
    a *= 0.5;
  }
  return v;
}
`;

const aurora = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.08;

  // Slow domain-warped curtains
  vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 - t * 0.7 + 3.1));
  float band = fbm(p * 2.0 + q * 1.6 + vec2(0.0, t * 2.0));
  float curtain = smoothstep(0.35, 0.85, band) * (1.0 - smoothstep(0.1, 0.9, uv.y * 0.9 + 0.1 - q.y * 0.4));

  vec3 col = u_bg;
  col += u_c1 * curtain * 0.9;
  col += u_c2 * smoothstep(0.5, 0.95, fbm(p * 1.2 - q + t)) * 0.55 * (1.0 - uv.y);
  // Soft horizon glow
  col += u_c1 * 0.12 * exp(-abs(p.y + 0.35) * 6.0);
  // Grain
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.03;
  // Vignette
  col *= 1.0 - 0.35 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

const liquid = /* glsl */ `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.12;
  vec2 m = (u_mouse - 0.5) * 0.4;

  // Metaball-style blobs drifting through domain warp
  vec2 w = p + 0.35 * vec2(fbm(p * 1.5 + t), fbm(p * 1.5 - t + 7.0)) - 0.175;
  float d1 = length(w - vec2(sin(t * 1.3) * 0.4 + m.x, cos(t * 0.9) * 0.3 + m.y));
  float d2 = length(w - vec2(cos(t * 1.1 + 2.0) * 0.5, sin(t * 0.7 + 1.0) * 0.35));
  float d3 = length(w - vec2(sin(t * 0.6 + 4.0) * 0.6, cos(t * 1.4 + 3.0) * 0.4));
  float field = 0.12 / (d1 + 0.05) + 0.1 / (d2 + 0.05) + 0.09 / (d3 + 0.05);

  // Soft halo → dense core → thin bright rim, all continuous so blobs read as liquid, not flat discs
  float halo = smoothstep(0.25, 1.1, field);
  float core = smoothstep(0.9, 1.9, field);
  float rim = exp(-abs(field - 1.05) * 7.0);

  vec3 col = u_bg;
  col = mix(col, u_c2 * 0.55, halo * 0.75);
  col = mix(col, mix(u_c2, u_c1, 0.5) * 0.85, core * 0.9);
  col += u_c1 * rim * 0.35;
  col += u_c1 * 0.05 * fbm(p * 3.0 + t);
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.03;
  col *= 1.0 - 0.3 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

const grid = /* glsl */ `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.5;

  // Perspective floor: y below horizon
  float horizon = 0.05;
  float y = p.y - horizon;
  vec3 col = u_bg;

  if (y < 0.0) {
    float depth = 1.0 / (-y + 0.02);
    vec2 g = vec2(p.x * depth, depth * 0.6 + t);
    vec2 cell = abs(fract(g) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.06 * depth * 0.15 + 0.01, min(cell.x, cell.y));
    float fade = exp(-(-y) * 0.2) * smoothstep(0.0, 0.15, -y);
    col += u_c1 * line * fade * 0.9;
    col += u_c1 * 0.08 * fade;
  }
  // Horizon glow and sky gradient
  col += u_c2 * 0.35 * exp(-abs(y) * 14.0);
  col += u_c2 * 0.12 * smoothstep(0.0, 0.9, y) * (1.0 - smoothstep(0.0, 0.9, y));
  // Stars
  vec2 sp = floor(gl_FragCoord.xy / 3.0);
  float star = step(0.9975, hash21(sp)) * step(0.0, y) * (0.5 + 0.5 * sin(u_time * 2.0 + hash21(sp) * 30.0));
  col += star * 0.7;
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.025;
  col *= 1.0 - 0.25 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

const particles = /* glsl */ `
float layer(vec2 uv, float scale, float speed, float seed) {
  uv *= scale;
  uv.y += u_time * speed;
  vec2 id = floor(uv);
  vec2 f = fract(uv) - 0.5;
  float acc = 0.0;
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec2 o = vec2(float(xx), float(yy));
      vec2 h = hash22(id + o + seed);
      vec2 pos = o + (h - 0.5) * 0.8 + 0.1 * vec2(sin(u_time * (0.5 + h.x)), cos(u_time * (0.4 + h.y)));
      float d = length(f - pos);
      float size = 0.02 + 0.05 * h.y;
      acc += smoothstep(size, 0.0, d) * (0.4 + 0.6 * h.x);
    }
  }
  return acc;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 par = (u_mouse - 0.5) * 0.03;

  vec3 col = u_bg;
  // Backdrop glow
  col += u_c2 * 0.18 * exp(-length(p - vec2(0.0, -0.1)) * 1.8);
  // Three parallax layers
  col += u_c1 * 0.35 * layer(uv + par * 0.5, 6.0, 0.02, 1.0);
  col += mix(u_c1, u_c2, 0.5) * 0.6 * layer(uv + par, 3.5, 0.04, 2.0);
  col += u_c2 * 0.9 * layer(uv + par * 2.0, 2.0, 0.07, 3.0);
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.025;
  col *= 1.0 - 0.3 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;

const noisePreset = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.05;

  // Two soft color fields slowly breathing, film grain on top
  float a = fbm(p * 1.1 + vec2(t, -t));
  float b = fbm(p * 0.9 - vec2(t * 0.7, t * 0.4) + 5.0);
  vec3 col = u_bg;
  col = mix(col, u_c1 * 0.55, smoothstep(0.45, 0.8, a) * (1.0 - uv.y * 0.6));
  col = mix(col, u_c2 * 0.55, smoothstep(0.5, 0.85, b) * uv.y);
  // Grain, stronger than the other presets: this preset is about texture
  float grain = hash21(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5;
  col += grain * 0.08;
  col *= 1.0 - 0.4 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`;


const pixel = /* glsl */ `
// Flat, institutional, pixel-exact. No gradient, no glow, no vignette, no grain.
// A faint dot grid (24 cells high), and exactly one accent pixel crossing the frame at mid height
// in discrete steps, then a pause, then again. Nothing else moves.
void main() {
  float cellsY = 24.0;
  float cell = u_res.y / cellsY;
  vec2 g = gl_FragCoord.xy / cell;         // grid coordinates
  vec2 id = floor(g);
  vec2 f = fract(g);

  vec3 col = u_bg;

  // Dot grid: a 2x2-ish square at the centre of every cell, very low contrast (about 6% of fg toward bg)
  float dotSize = 0.08;
  float mark = step(abs(f.x - 0.5), dotSize) * step(abs(f.y - 0.5), dotSize);
  col = mix(col, u_c1, mark * 0.10);

  // One travelling pixel: crosses in 6 s at 4 cells/s, then waits so the loop reads as deliberate.
  float cols = ceil(u_res.x / cell);
  float period = cols / 4.0 + 3.0;         // travel time + 3 s pause
  float tt = mod(u_time, period) * 4.0;    // cells travelled
  float px = floor(tt);
  float row = floor(cellsY * 0.62);        // slightly above the middle, under the headline
  float on = step(px, cols) * (1.0 - step(cols, px));
  float here = step(abs(id.x - px), 0.01) * step(abs(id.y - row), 0.01);
  // Hard square, 70% of the cell
  float inner = step(abs(f.x - 0.5), 0.35) * step(abs(f.y - 0.5), 0.35);
  col = mix(col, u_c1, here * inner * on);

  fragColor = vec4(col, 1.0);
}
`;

const dither = /* glsl */ `
// Ordered 4x4 Bayer dithering of a slow field. No gradient survives: every pixel is bg or accent, and the
// impression of shading comes from the dot pattern alone. The centre of the frame is held back so the
// headline always sits on the darkest part of the field (the contrast rule in /make-background).
const mat4 bayer = mat4(
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0
);
float bayerAt(vec2 c) {
  int x = int(mod(c.x, 4.0));
  int y = int(mod(c.y, 4.0));
  vec4 row = bayer[y];
  return (x == 0 ? row.x : x == 1 ? row.y : x == 2 ? row.z : row.w) / 16.0;
}
void main() {
  float cell = 3.0;
  vec2 c = floor(gl_FragCoord.xy / cell);
  vec2 p = (c * cell - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.05;

  float v = fbm(p * 1.9 + vec2(t, -t * 0.6));
  // Push the field to the edges: dark middle third, denser corners.
  float edge = smoothstep(0.25, 1.05, length(p * vec2(0.62, 1.0)));
  v = (v * 0.55 + 0.12) * edge;

  float lit = step(bayerAt(c), clamp(v, 0.0, 1.0));
  float hot = step(bayerAt(c + 2.0), clamp(v - 0.42, 0.0, 1.0) * 1.6);
  vec3 col = mix(u_bg, u_c1, lit * 0.42);
  col = mix(col, u_c2, hot * 0.35);
  fragColor = vec4(col, 1.0);
}
`;

const rays = /* glsl */ `
// Crepuscular rays from a single off-centre source. The source drifts with the pointer, the beams are
// noise-modulated in angle only, so nothing pulses. Reads as light through a gap, not as a glow.
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 src = vec2(0.26 + (u_mouse.x - 0.5) * 0.12, 0.92 + (u_mouse.y - 0.5) * 0.06);
  vec2 d = uv - src;
  d.x *= u_res.x / u_res.y;

  float ang = atan(d.y, d.x);
  float dist = length(d);
  float t = u_time * 0.05;

  // Beams: two octaves of noise across the angle, sharpened.
  float beams = noise(vec2(ang * 3.2, t)) * 0.6 + noise(vec2(ang * 9.0, t * 1.7)) * 0.4;
  beams = pow(clamp(beams, 0.0, 1.0), 2.6);

  // Falloff along the beam, plus a soft core at the source.
  float fall = exp(-dist * 2.1);
  float core = exp(-dist * 7.0) * 0.5;

  // Dust in the light
  float dust = fbm(uv * vec2(3.0, 6.0) + vec2(0.0, -t * 1.5)) * 0.35;

  vec3 col = u_bg;
  col += u_c1 * (beams * fall * (0.55 + dust));
  col += u_c2 * core;
  // Ground haze so the bottom does not read as an empty band
  col += u_c1 * smoothstep(0.55, 0.0, uv.y) * 0.05;

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.018;
  fragColor = vec4(col, 1.0);
}
`;

const caustics = /* glsl */ `
// Pool caustics: a Voronoi lattice whose domain is warped over time, drawn only at its cell walls.
// F2 - F1 is small exactly on the boundary between two cells, which is where light focuses on a pool
// floor, so the field reads as thin travelling filaments instead of a glow. The middle of the frame is
// pulled back toward the page colour so a headline can sit on it.
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.09;

  // Warp the domain: this is what makes the filaments swim rather than crawl.
  vec2 q = p * 3.4;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += 0.38 * vec2(sin(q.y * 1.9 + t * (1.0 + fi * 0.3)), cos(q.x * 1.7 - t * (0.8 + fi * 0.25)));
  }

  vec2 cell = floor(q);
  vec2 f = fract(q);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(cell + g);
      o = 0.5 + 0.45 * sin(t * 1.3 + 6.2831 * o);
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }

  float wall = 1.0 - smoothstep(0.0, 0.16, f2 - f1);   // thin line on the cell boundary
  float bright = pow(wall, 1.6);

  // Depth: the water darkens toward the bottom of the frame.
  float depth = smoothstep(1.0, -0.5, p.y);
  vec3 col = mix(u_bg, u_bg * 0.72, depth * 0.5);
  col = mix(col, u_c1, bright * 0.55);
  col = mix(col, u_c2, pow(wall, 4.0) * 0.4);
  col = mix(col, u_bg, smoothstep(0.95, 0.1, length(p * vec2(0.5, 0.9))) * 0.4);
  fragColor = vec4(col, 1.0);
}
`;

const topo = /* glsl */ `
// Contour lines of a very slowly evolving height field: only the lines are drawn, never the areas between
// them, with every fifth line heavier — the way a survey sheet reads. fwidth keeps the stroke one pixel
// wide at any resolution, which is the whole point: a topo map that fills is just noise.
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.012;

  float h = fbm(p * 1.25 + vec2(t, t * 0.6));
  h += 0.3 * fbm(p * 2.9 - vec2(t * 0.8, 0.0));

  float levels = 22.0;
  float band = h * levels;
  float w = fwidth(band);
  float f = fract(band);
  float d = min(f, 1.0 - f);              // distance to the nearest contour, in band units
  float line = 1.0 - smoothstep(0.0, w * 1.1, d);
  float index = step(mod(floor(band), 5.0), 0.5);   // every fifth line
  float heavy = (1.0 - smoothstep(0.0, w * 2.2, d)) * index;

  vec3 col = u_bg;
  col = mix(col, u_c1, line * 0.22);
  col = mix(col, u_c1, heavy * 0.34);
  // One lit basin under the pointer, so the map has a subject rather than an even texture.
  vec2 m = (u_mouse - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  col += u_c2 * exp(-length(p - m) * 3.2) * 0.10;
  fragColor = vec4(col, 1.0);
}
`;

const halftone = /* glsl */ `
// Rotated dot screen. Dot radius carries the tone; the screen sits at 15 degrees, the printer's default,
// so the pattern never lines up with the page grid. The tone is weighted to the edges, so the middle of
// the frame — where the headline is — stays close to the page colour.
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.06;

  float v = fbm(p * 1.4 + vec2(t, -t * 0.5));
  float edge = smoothstep(0.2, 1.0, length(p * vec2(0.6, 1.0)));
  v = clamp((v * 0.85 + 0.1) * edge, 0.0, 1.0);

  float a = radians(15.0);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  float pitch = max(u_res.y / 84.0, 5.0);
  vec2 g = rot * gl_FragCoord.xy / pitch;
  float d = length(fract(g) - 0.5);
  float r = sqrt(v) * 0.5;
  float dot1 = 1.0 - smoothstep(r - 0.07, r + 0.07, d);

  // Second screen at 75 degrees in accent2, only in the densest zones: two-colour print.
  mat2 rot2 = mat2(cos(radians(75.0)), -sin(radians(75.0)), sin(radians(75.0)), cos(radians(75.0)));
  float d2 = length(fract(rot2 * gl_FragCoord.xy / (pitch * 1.4)) - 0.5);
  float r2 = smoothstep(0.62, 1.0, v) * 0.34;
  float dot2 = 1.0 - smoothstep(r2 - 0.07, r2 + 0.07, d2);

  vec3 col = u_bg;
  col = mix(col, u_c1, dot1 * 0.55);
  col = mix(col, u_c2, dot2 * 0.45);
  fragColor = vec4(col, 1.0);
}
`;



// ---------------------------------------------------------------------------------------------
// LE FOND DE TARE. Les courbes de niveau d'un champ de hauteur — des ondes — posees sur un plan
// vu en perspective : le sol s'eloigne vers le haut du cadre, les courbes s'y resserrent, et
// c'est cette densite croissante qui fait la profondeur. Aucune lumiere n'est simulee, donc il
// n'y a rien a faire suivre au pointeur : LE POINTEUR DEPLACE LE TERRAIN (locks 24 et 25).
//
// Achromatique : u_c1 et u_c2 sont deux gris de filet. La rampe encode bps et n'a rien a faire
// dans un fond.
//
// La regle dure de /make-background — le tiers central plus sombre que les bords — est tenue par
// le terme `centre`, qui eteint les courbes derriere le titre grave et le champ de saisie.
//
// ATTENTION en editant : ce GLSL vit dans un gabarit JavaScript. Un backquote, meme dans un
// commentaire, referme la chaine et casse le build. Il n'y en a aucun ci-dessous.
const releve = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // PERSPECTIVE. L'horizon est juste au-dessus du cadre : tout l'ecran est du sol. La profondeur
  // partirait a l'infini a l'horizon, d'ou le max() qui la borne.
  float horizon = 1.04;
  float prof = 0.40 / max(0.10, horizon - uv.y);

  // Coordonnees AU SOL : x s'ecarte avec la profondeur (c'est la fuite), y EST la profondeur.
  vec2 sol = vec2((uv.x - 0.5) * prof * 1.7, prof);

  // LE POINTEUR DEPLACE LE TERRAIN, il ne l'eclaire pas. Amplitude volontairement petite : le
  // fond doit repondre, pas danser.
  vec2 m = u_mouse - 0.5;
  sol += vec2(m.x * 1.6, m.y * 1.0);

  // On avance, lentement, et l'avancee est bornee par un mod : une translation qui croit sans
  // fin finit par sortir du domaine ou le bruit a encore du detail.
  vec2 champ = sol * 0.30;
  champ.y += mod(u_time * 0.055, 8.0);

  // Deux octaves : le relief est un pretexte a des courbes, pas un paysage.
  float h = fbm(champ);
  h += 0.28 * fbm(champ * 2.3 + 7.0);

  // LES COURBES, et seulement elles : jamais l'aplat entre deux courbes. fwidth tient le trait a
  // un pixel quelle que soit la densite — sans lui, le haut du cadre se remplit et devient du
  // bruit.
  float niveaux = 26.0;
  float bande = h * niveaux;
  float w = max(fwidth(bande), 0.012);
  float f = fract(bande);
  float d = min(f, 1.0 - f);
  float trait = 1.0 - smoothstep(0.0, w * 1.05, d);
  float cinq = step(mod(floor(bande), 5.0), 0.5);        // une courbe sur cinq est maitresse
  float maitresse = (1.0 - smoothstep(0.0, w * 2.0, d)) * cinq;

  // Au loin les courbes se serrent sous le pixel : au lieu de crepiter, elles s'eteignent.
  // smoothstep(a, b, x) avec a > b est INDEFINI en GLSL : ecrit a l'endroit, puis inverse.
  float loin = 1.0 - smoothstep(0.34, 1.0, uv.y);

  // LE TIERS CENTRAL RESTE SOMBRE : le titre grave et le champ sont la, et un fond qui mange un
  // titre est un fond rate.
  vec2 c = (uv - vec2(0.40, 0.56)) * vec2(1.15, 1.0);
  float centre = 0.30 + 0.70 * smoothstep(0.10, 0.52, length(c));

  float k = loin * centre;

  vec3 col = u_bg;
  col = mix(col, u_c1, trait * 0.85 * k);
  col = mix(col, u_c2, maitresse * 1.00 * k);
  fragColor = vec4(col, 1.0);
}
`;

export const presets: Record<PresetShader, string> = {
  aurora: common + aurora,
  liquid: common + liquid,
  grid: common + grid,
  particles: common + particles,
  noise: common + noisePreset,
  pixel: common + pixel,
  dither: common + dither,
  rays: common + rays,
  caustics: common + caustics,
  topo: common + topo,
  halftone: common + halftone,
  releve: common + releve,
};

export const vertexShader = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
