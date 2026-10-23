// Pilot portraits, made of traits like a generative collection: species, hair or headgear, eyes, mouth,
// outfit, extras and a cosmic backdrop are all drawn from the pilot's avatar number, each trait with its
// own rarity. A 32 × 32 bust in four tones of the phosphor, outlined in the darkest one.
const N = 32;
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// layers, back to front: a pixel is outlined where it borders a layer further back
const BG = 0, HOOD = 1, BODY = 2, NECK = 3, HEAD = 4, HAIR = 5, GEAR = 6;
type T = 0 | 1 | 2 | 3;

export type Portrait = { tone: Int8Array; traits: string[] };

export function portrait(seed: number): Portrait {
  const rnd = mulberry(seed * 2654435761 + 7);
  const pick = <V,>(opts: [V, number][]): V => { let s = opts.reduce((a, o) => a + o[1], 0) * rnd(); for (const [v, w] of opts) if ((s -= w) < 0) return v; return opts[0][0]; };
  const chance = (p: number) => rnd() < p;
  const tone = new Int8Array(N * N), z = new Int8Array(N * N);
  const put = (x: number, y: number, t: number, l = -1) => { if (x < 0 || y < 0 || x >= N || y >= N) return; tone[y * N + x] = t; if (l >= 0) z[y * N + x] = l; };
  const zAt = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : z[y * N + x]);
  const mirror = (x: number, y: number, t: number, l = -1) => { put(x, y, t, l); put(N - 1 - x, y, t, l); };
  const dark = (t: number) => Math.max(1, t - 1) as T, lite = (t: number) => Math.min(3, t + 1) as T;

  // —— traits
  const species = pick<"human" | "alien" | "android">([["human", 62], ["alien", 20], ["android", 18]]);
  const skin = pick<T>([[3, 45], [2, 40], [1, 15]]);
  const bgT = pick<T>([[1, 50], [2, 35], [3, 15]]);
  const backdrop = pick<string>([["stars", 30], ["ringed planet", 20], ["moon", 14], ["nebula", 14], ["orbits", 12], ["warp", 10]]);
  const top = pick<string>(species === "alien"
    ? [["antennae", 35], ["bald", 20], ["bubble helmet", 15], ["hood", 12], ["headset", 10], ["mohawk", 8]]
    : [["short hair", 18], ["long hair", 12], ["buzz cut", 10], ["mohawk", 7], ["bun", 7], ["curls", 9], ["cap", 8], ["headset", 10], ["bubble helmet", 9], ["hood", 6], ["goggles", 4]]);
  const hairT = pick<T>([[1, 60], [3, 25], [2, 15]]);
  const eyes = pick<string>(species === "alien" ? [["big eyes", 60], ["three eyes", 25], ["visor", 15]]
    : species === "android" ? [["cyber eye", 55], ["visor", 30], ["shades", 15]]
    : [["calm eyes", 34], ["side glance", 18], ["tired eyes", 12], ["glasses", 16], ["shades", 12], ["visor", 8]]);
  const mouth = pick<string>(species === "android" ? [["grille", 70], ["flat", 30]]
    : [["flat", 32], ["smile", 26], ["open", 10], ["moustache", 10], ["beard", 14], ["smirk", 8]]);
  const outfit = pick<string>([["flight suit", 30], ["jacket", 20], ["hoodie", 18], ["turtleneck", 16], ["tee", 16]]);
  const clothT = pick<T>([[1, 40], [2, 40], [3, 20]]);
  const extras = [chance(0.18) && "earring", chance(0.12) && "star tattoo", chance(0.14) && species !== "android" && "freckles", chance(0.08) && "scar"].filter(Boolean) as string[];

  // —— backdrop
  tone.fill(bgT);
  const deco = bgT === 3 ? 2 : bgT === 1 ? 2 : 3;
  if (backdrop === "stars" || backdrop === "warp") {
    for (let k = 0; k < 14; k++) { const x = Math.floor(rnd() * N), y = Math.floor(rnd() * 22); put(x, y, deco); }
    const sx = 3 + Math.floor(rnd() * 5), sy = 3 + Math.floor(rnd() * 6); // one bright star
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => put(sx + a, sy + b, deco));
    if (backdrop === "warp") for (let k = 0; k < 9; k++) { const y = 1 + Math.floor(rnd() * 24), x = Math.floor(rnd() * 26), L = 3 + Math.floor(rnd() * 5); for (let i = 0; i < L; i++) put(x + i, y, i === L - 1 ? deco : lite(bgT) === bgT ? dark(bgT) : lite(bgT)); }
  } else if (backdrop === "ringed planet" || backdrop === "moon") {
    const left = chance(0.5), cx = left ? 4 : 27, cy = 6, r = backdrop === "moon" ? 5 : 6;
    for (let y = 0; y < 16; y++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) put(x, y, backdrop === "moon" && Math.hypot(x + 0.5 - cx - 2.5, y + 0.5 - cy + 1.5) <= r - 0.5 ? bgT : deco);
      if (backdrop === "ringed planet") { const e = ((x + 0.5 - cx) / (r * 1.9)) ** 2 + ((y + 0.5 - cy - (x - cx) * 0.25) / (r * 0.45)) ** 2; if (e > 0.82 && e < 1.15 && !(d <= r && y < cy)) put(x, y, deco === 3 ? 2 : 3); }
    }
    for (let k = 0; k < 6; k++) put(Math.floor(rnd() * N), Math.floor(rnd() * 20), deco);
  } else if (backdrop === "nebula") {
    const cx = rnd() * N, cy = rnd() * 14;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x - cx, (y - cy) * 1.4) + rnd() * 4; if (d < 9 || (d < 14 && (x + y) % 2 === 0)) put(x, y, deco); }
  } else { // orbits
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const e = Math.hypot((x + 0.5 - 16) / 1.6, y + 0.5 - 14); if (Math.abs(e - 11) < 0.5 || Math.abs(e - 15) < 0.5) put(x, y, deco); }
    put(6, 8, deco); put(7, 8, deco); put(6, 9, deco); put(7, 9, deco);
  }

  // —— head geometry
  const rx = 7.5 + pick([[0, 2], [0.5, 3], [1, 2]]), cy = 14.5, ry = 10.2, jaw = 0.35 + rnd() * 0.6, ey = 15 + (chance(0.4) ? 1 : 0);
  const inHead = (x: number, y: number) => { const dy = (y + 0.5 - cy) / ry; let dx = (x + 0.5 - 16) / rx; if (dy > 0.25) dx *= 1 + (dy - 0.25) * jaw; const p = dy < 0 ? 2.7 : 2.2; return Math.abs(dx) ** p + Math.abs(dy) ** p <= 1; }; // a squarer skull
  let edgeL = 16; while (edgeL > 0 && inHead(edgeL - 1, ey)) edgeL--;
  let headTop = 0; while (!inHead(16, headTop)) headTop++;
  const helmet = top === "bubble helmet";

  // hood: behind everything that follows
  if (top === "hood") for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = ((x + 0.5 - 16) / (rx + 3.5)) ** 2 + ((y + 0.5 - cy + 1) / (ry + 3)) ** 2; if (d <= 1 || (y > 22 && Math.abs(x + 0.5 - 16) < rx + 5)) put(x, y, clothT, HOOD); }

  // body and neck
  for (let y = 26; y < N; y++) { const hw = Math.min(15.5, 10 + (y - 26) * 1.8); for (let x = 0; x < N; x++) if (Math.abs(x + 0.5 - 16) <= hw) put(x, y, clothT, BODY); }
  for (let y = 21; y < 29; y++) for (let x = 12; x < 20; x++) put(x, y, x >= 18 || y < 25 ? dark(skin) : skin, NECK);
  if (outfit === "turtleneck") for (let y = 23; y < 29; y++) for (let x = 11; x < 21; x++) put(x, y, y % 2 ? clothT : dark(clothT), NECK);

  // ears, then the head, shaded from the upper left
  if (!(top === "hood")) for (let y = ey - 1; y <= ey + 2; y++) { const pointy = species === "alien" && y === ey - 1; mirror(edgeL - 1, y, skin, HEAD); if (pointy) { mirror(edgeL - 2, y - 1, skin, HEAD); mirror(edgeL - 1, y - 1, skin, HEAD); } }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inHead(x, y)) put(x, y, x + 0.5 - 16 > rx - 2.6 || (y > 20 && x > 17) ? dark(skin) : skin, HEAD);

  // —— hair and headgear
  const hairBox = (dx: number, dy: number, f: (x: number, y: number, d: number) => boolean, t: number = hairT, l = HAIR) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = ((x + 0.5 - 16) / (rx + dx)) ** 2 + ((y + 0.5 - cy + 0.6) / (ry + dy)) ** 2; if (f(x, y, d)) put(x, y, t, l); }
  };
  const cut = pick<string>([["straight", 3], ["swept", 4], ["parted", 3]]), part = 11 + Math.floor(rnd() * 10), flip = chance(0.5);
  const fringe = Array.from({ length: N }, (_, x) => { const u = flip ? N - 1 - x : x, j = Math.floor(rnd() * 2);
    return cut === "straight" ? j : cut === "swept" ? Math.min(2, Math.round((u - 8) * 0.3) - 3) + j : Math.min(1, Math.round(Math.abs(x - part) * 0.4) - 3) + j; });
  if (top === "short hair" || top === "bun" || top === "long hair") {
    hairBox(1, 0.9, (x, y, d) => d <= 1 && (y < ey - 3 + fringe[x] || (y < ey && Math.abs(x + 0.5 - 16) > rx - 0.6)));
    if (top === "long hair") hairBox(2, 2, (x, y, d) => (d <= 1 || y > cy) && y < 28 && Math.abs(x + 0.5 - 16) > rx - 0.6 && Math.abs(x + 0.5 - 16) < rx + 2.5 && y >= headTop + 2);
    if (top === "bun") for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x + 0.5 - 16, y + 0.5 - (headTop - 1)) <= 3) put(x, y, hairT, HAIR);
  } else if (top === "curls") {
    hairBox(2.6, 1.8, (x, y, d) => d <= 1 + rnd() * 0.25 && (y < ey - 3 + fringe[x] || (y < ey + 2 && Math.abs(x + 0.5 - 16) > rx - 0.6)));
    for (let k = 0; k < 40; k++) { const x = Math.floor(rnd() * N), y = Math.floor(rnd() * N); if (z[y * N + x] === HAIR) put(x, y, (x + y) % 2 ? lite(hairT) : dark(hairT)); }
  } else if (top === "mohawk") {
    for (let y = headTop - 4; y < ey - 3; y++) for (let x = 14; x < 18; x++) if (y >= headTop - 1 || (x + y) % 2 === 0 || x === 15 || x === 16) put(x, y, hairT, HAIR);
  } else if (top === "buzz cut") {
    for (let y = headTop; y < ey - 3; y++) for (let x = 0; x < N; x++) if (inHead(x, y) && (x + y) % 2 === 0) put(x, y, dark(skin) === skin ? 3 : dark(skin));
  } else if (top === "cap") {
    hairBox(0.6, 0.6, (x, y, d) => d <= 1 && y < ey - 3, clothT, GEAR);
    for (let x = 16 - Math.round(rx) - 1; x < 16 + Math.round(rx) + 5; x++) put(x, ey - 3, dark(clothT), GEAR);
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => put(15 + a, ey - 6 + b, clothT === 3 ? 1 : 3)); // the badge: a star
  } else if (top === "goggles") {
    hairBox(1, 0.9, (x, y, d) => d <= 1 && y < ey - 4 + fringe[x]);
    for (let x = 16 - Math.round(rx); x < 16 + Math.round(rx); x++) put(x, ey - 4, 1, GEAR);
    for (const gx of [11, 18]) for (let y = ey - 6; y < ey - 3; y++) for (let x = gx; x < gx + 3; x++) put(x, y, y === ey - 5 && x === gx + 1 ? 3 : 2, GEAR);
  } else if (top === "antennae") {
    for (const s of [-1, 1]) { let x = 16 + s * 3, y = headTop + 1; for (let k = 0; k < 5; k++) { put(Math.round(x), y, 1, GEAR); y--; x += s * 0.6; } put(Math.round(x), y, 3, GEAR); put(Math.round(x) + s, y, 3, GEAR); put(Math.round(x), y - 1, 3, GEAR); }
  }
  // light catching the hair
  if (["short hair", "long hair", "bun", "curls", "goggles"].includes(top)) for (let y = 0; y < N; y++) for (let x = 0; x < 16; x++) if (z[y * N + x] === HAIR && y < headTop + 4 && (x * 2 + y) % 5 === 0) put(x, y, hairT === 3 ? 2 : lite(hairT));

  if (top === "hood") hairBox(1.2, 1.2, (x, y, d) => d > 1 && y < ey + 5 && zAt(x, y) === HOOD && (((x + 0.5 - 16) / (rx + 2.2)) ** 2 + ((y + 0.5 - cy + 0.6) / (ry + 2.2)) ** 2) <= 1, clothT, GEAR);

  // —— outfit details
  if (outfit === "flight suit") { for (let x = 9; x < 23; x++) { put(x, 28, 3); put(x, 29, 0); } put(23, 30, 3); put(24, 30, 3); put(23, 31, 3); put(24, 31, 1); }
  if (outfit === "jacket") for (let y = 28; y < N; y++) { const w = Math.floor((y - 27) / 1.2); for (let x = 16 - w; x < 16 + w; x++) put(x, y, x === 16 - w || x === 15 + w ? 0 : 3); }
  if (outfit === "hoodie") { for (let x = 9; x < 23; x++) put(x, 28, dark(clothT) === clothT ? 3 : dark(clothT)); for (let y = 29; y < 32; y++) { put(13, y, 3); put(18, y, 3); } }
  if (outfit === "tee") for (let y = 27; y < 30; y++) for (let x = 12; x < 20; x++) if (Math.hypot(x + 0.5 - 16, y - 26) < 3.6) put(x, y, skin);

  // —— outline: every pixel against a layer further back turns to the darkest tone
  const edge = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = z[y * N + x]; if (l === BG) continue;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o = zAt(x + a, y + b); if (o >= 0 && o < l) { edge[y * N + x] = 1; break; } }
  }
  edge.forEach((e, k) => { if (e) tone[k] = 0; });

  if (top === "headset") { // drawn over the outline: a band over the crown, ear cups and a mic
    hairBox(1.6, 1.2, (x, y, d) => d <= 1 && d > 0.7 && y < ey - 1, 2, GEAR);
    hairBox(1.6, 1.2, (x, y, d) => (d <= 1.0 && d > 0.9 || d > 0.62 && d <= 0.7) && y < ey - 1, 0, GEAR);
    for (const s of [-1, 1]) for (let y = ey - 2; y < ey + 4; y++) for (let k = 0; k < 4; k++) { const x = s < 0 ? edgeL - 3 + k : N - edgeL - 1 + k; put(x, y, k === 0 || k === 3 || y === ey - 2 || y === ey + 3 ? 0 : k === 1 && y === ey - 1 ? 3 : 2, GEAR); }
    for (let k = 0; k < 7; k++) put(N - edgeL + 1 - Math.round(k * 0.9), ey + 4 + Math.round(k * 0.4), 0, GEAR); // the mic boom
    put(N - edgeL - 6, ey + 6, 3, GEAR); put(N - edgeL - 7, ey + 6, 3, GEAR);
  }
  // —— the face
  const L = 11, R = 19; // left eye's columns 11–12, right eye's 19–20
  if (!["glasses", "shades", "visor"].includes(eyes) || species === "alien") { mirror(L - 1, ey - 2, top === "buzz cut" || hairT === 3 ? 1 : hairT === 2 ? 1 : 0); mirror(L, ey - 2, hairT === 3 ? 1 : 0); mirror(L + 1, ey - 2, hairT === 3 ? 1 : 0); }
  if (eyes === "calm eyes") { mirror(L, ey, 0); mirror(L + 1, ey, 0); mirror(L, ey - 1, lite(skin)); }
  else if (eyes === "side glance") { put(L, ey, 3); put(L + 1, ey, 0); put(R, ey, 3); put(R + 1, ey, 0); }
  else if (eyes === "tired eyes") { mirror(L, ey, 0); mirror(L + 1, ey, 0); mirror(L, ey - 1, dark(skin)); mirror(L + 1, ey - 1, dark(skin)); mirror(L + 1, ey + 1, dark(skin)); }
  else if (eyes === "glasses") { for (const gx of [L - 1, R - 1]) for (let y = ey - 1; y <= ey + 1; y++) for (let x = gx; x < gx + 4; x++) put(x, y, y === ey - 1 || y === ey + 1 || x === gx || x === gx + 3 ? 0 : x === gx + 1 && y === ey ? 3 : skin); mirror(L, ey, 3); mirror(L + 1, ey, 0); put(15, ey - 1, 0); put(16, ey - 1, 0); mirror(L - 2, ey - 1, 0); }
  else if (eyes === "shades") { for (let x = L - 2; x <= R + 2; x++) { put(x, ey - 1, 0); put(x, ey, x === 15 || x === 16 ? skin : 0); if (x !== 15 && x !== 16 && x > L - 2 && x < R + 2) put(x, ey + 1, 0); } mirror(L, ey - 1, 3); }
  else if (eyes === "visor") { for (let x = edgeL; x < N - edgeL; x++) { put(x, ey - 2, 0); put(x, ey - 1, 3); put(x, ey, x % 3 === 0 ? 2 : 3); put(x, ey + 1, 0); } }
  else if (eyes === "cyber eye") { put(L, ey, 0); put(L + 1, ey, 0); for (let y = ey - 1; y <= ey + 1; y++) for (let x = R - 1; x <= R + 1; x++) put(x, y, x === R && y === ey ? 3 : 1); put(R + 2, ey, 0); for (let y = headTop + 2; y < 22; y++) if (inHead(R + 3, y) && (y < ey - 1 || y > ey + 1)) put(R + 3, y, dark(skin) === skin ? 1 : dark(dark(skin))); put(edgeL + 1, ey - 3, 3); }
  else if (eyes === "big eyes" || eyes === "three eyes") { for (const ex of [L - 1, R]) for (let y = ey - 1; y <= ey + 1; y++) for (let x = ex; x < ex + 3; x++) put(x, y, 0); mirror(L - 1, ey - 1, 3); if (eyes === "three eyes") { put(15, ey - 4, 0); put(16, ey - 4, 0); put(15, ey - 5, 3); put(16, ey - 5, 0); } }
  // the cheekbones and the jaw take a little shadow
  if (species !== "android") for (let y = ey + 2; y < ey + 8; y++) { const x = N - edgeL - 2 - Math.floor((y - ey) / 3); if (z[y * N + x] === HEAD && tone[y * N + x] === skin) put(x, y, dark(skin)); }
  // nose
  if (species !== "alien") { put(16, ey + 2, dark(skin)); put(16, ey + 3, dark(skin)); put(15, ey + 4, dark(skin)); put(16, ey + 4, 0); }
  // mouth
  const my = ey + 6;
  if (mouth === "beard") { for (let y = my - 2; y < N; y++) for (let x = 0; x < N; x++) if (inHead(x, y) && !(y === my - 2 && x > 13 && x < 18) && z[y * N + x] === HEAD && tone[y * N + x] !== 0) put(x, y, hairT === 3 ? 3 : hairT); for (let x = 14; x < 18; x++) put(x, my, 0); }
  else if (mouth === "smile") { put(14, my - 1, 0); put(17, my - 1, 0); put(15, my, 0); put(16, my, 0); }
  else if (mouth === "smirk") { for (let x = 14; x < 17; x++) put(x, my, 0); put(17, my - 1, 0); }
  else if (mouth === "open") { for (let x = 15; x < 17; x++) { put(x, my - 1, 0); put(x, my, 0); } put(15, my - 1, 3); }
  else if (mouth === "grille") { for (let x = 13; x < 19; x++) { put(x, my - 1, 0); put(x, my, x % 2 ? 0 : 2); } }
  else if (mouth === "moustache") { for (let x = 13; x < 19; x++) put(x, my - 1, hairT === 3 ? 3 : 0); for (let x = 15; x < 17; x++) put(x, my, 0); }
  else for (let x = 14; x < 18; x++) put(x, my, 0);
  // extras
  if (extras.includes("earring") && top !== "hood" && top !== "headset") { put(edgeL - 1, ey + 3, 0); put(edgeL - 1, ey + 4, 3); }
  if (extras.includes("star tattoo")) { const tx = R + 1, ty = ey + 3; [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => put(tx + a, ty + b, skin === 1 ? 3 : 0)); }
  if (extras.includes("freckles")) [[L - 1, ey + 2], [L + 1, ey + 2], [L, ey + 3], [R, ey + 2], [R + 2, ey + 2], [R + 1, ey + 3]].forEach(([x, y]) => put(x, y, dark(skin) === skin ? 2 : dark(skin)));
  if (extras.includes("scar")) for (let k = 0; k < 5; k++) put(L - 1 + k, ey - 4 + k, lite(skin) === skin ? 2 : lite(skin));

  // —— the bubble helmet goes over it all: a glass rim, a glint, a collar ring
  if (helmet) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 14.5), a = Math.atan2(y + 0.5 - 14.5, x + 0.5 - 16);
      if (d > 13.4 && d <= 14.4 && y < 27) put(x, y, 3);
      else if (d > 12.4 && d <= 13.4 && y < 27) put(x, y, 0);
      if (d > 10 && d <= 11 && a > -2.6 && a < -1.9) put(x, y, 3);
    }
    for (let x = 3; x < 29; x++) { put(x, 27, 3); put(x, 28, 2); put(x, 29, 0); }
  }

  const traits = [species, top, eyes, mouth, outfit, backdrop, ...extras];
  return { tone, traits };
}

const OPAC = ["", "0.3", "0.62", "1"];
const cache = new Map<number, string>();
/** the portrait's pixels as SVG rectangles, row runs merged; tone 0 is the background colour */
function rects(seed: number) {
  let s = cache.get(seed); if (s) return s;
  const { tone } = portrait(seed); s = "";
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) { const t = tone[y * N + x]; let e = x + 1; while (e < N && tone[y * N + e] === t) e++; if (t > 0) s += `<rect x="${x}" y="${y}" width="${e - x}" height="1"${t < 3 ? ` opacity="${OPAC[t]}"` : ""}/>`; x = e; }
  }
  if (cache.size > 300) cache.clear();
  cache.set(seed, s); return s;
}

export function avatarSvg(seed: number, size = 48, cls = "ava") {
  const crisp = size % N === 0 ? ` shape-rendering="crispEdges"` : "";
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 ${N} ${N}" fill="currentColor"${crisp} aria-hidden="true"><rect width="${N}" height="${N}" style="fill:var(--bg)"/>${rects(seed)}</svg>`;
}
export const avatarTraits = (seed: number) => portrait(seed).traits;
