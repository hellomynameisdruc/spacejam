// Typical tempo of a style, as a range in BPM; null = no steady beat or too varied to name one.
// Exact Discogs style names first; unknown names fall back to keyword groups.

export type Tempo = { lo: number; hi: number } | null;
const T = (lo: number, hi: number): Tempo => ({ lo, hi });

const BY_NAME: Record<string, Tempo> = {
  // house
  "House": T(120, 128), "Deep House": T(118, 124), "Tech House": T(122, 128), "Acid House": T(120, 130),
  "Garage House": T(118, 125), "Progressive House": T(124, 130), "Hard House": T(140, 150), "Ghetto House": T(125, 135),
  "Hip-House": T(118, 125), "Italo House": T(118, 125), "Electro House": T(126, 130), "Speed Garage": T(130, 135),
  "UK Garage": T(130, 135), "Euro House": T(125, 132), "Tribal House": T(124, 130), "Latin House": T(120, 126),
  "Afro House": T(118, 124), "Jackin House": T(124, 128), "Funky House": T(124, 128), "Ghettotech": T(140, 160),
  "Bassline": T(135, 140), "Bass Music": T(130, 150), "Broken Beat": T(115, 125), "Donk": T(140, 150),
  "Freestyle": T(110, 125), "Dance-pop": T(115, 128), "Europop": T(115, 130), "Eurodance": T(130, 140),
  "Italodance": T(130, 140), "Jazzdance": T(110, 130), "New Beat": T(100, 115), "Electro": T(120, 135),
  "Hip Hop": T(85, 100), "Pop Rap": T(85, 100), "Contemporary R&B": T(70, 100), "RnB/Swing": T(85, 110),
  "Grime": T(138, 142), "Latin": null,
  // techno
  "Techno": T(125, 140), "Minimal": T(120, 128), "Minimal Techno": T(124, 130), "Acid": T(125, 140),
  "Dub Techno": T(115, 125), "Tribal": T(125, 135), "Deep Techno": T(120, 128), "Hard Techno": T(140, 155),
  "Schranz": T(145, 160), "EBM": T(110, 130), "Freetekno": T(150, 175), "Darkwave": T(100, 130),
  "New Wave": T(110, 140), "Gabber": T(160, 200), "Bleep": T(120, 130),
  // disco
  "Disco": T(110, 125), "Nu-Disco": T(110, 122), "Italo-Disco": T(115, 130), "Euro-Disco": T(115, 130),
  "Hi NRG": T(125, 140), "Boogie": T(105, 120), "Synth-pop": T(110, 130), "Funk": T(95, 115), "Soul": T(70, 110),
  "Jazz-Funk": T(95, 120), "Eurobeat": T(145, 160), "Ballad": T(60, 80), "Reggae": T(65, 90),
  "Pop Rock": null, "Vocal": null, "Chanson": null, "African": null,
  // trance
  "Trance": T(130, 140), "Progressive Trance": T(128, 136), "Psy-Trance": T(138, 148), "Goa Trance": T(135, 150),
  "Hard Trance": T(140, 150), "Tech Trance": T(132, 140), "Happy Hardcore": T(165, 180), "Hardstyle": T(145, 155),
  "Hands Up": T(135, 145), "Makina": T(160, 180),
  // drum n bass
  "Drum n Bass": T(165, 176), "Jungle": T(160, 175), "Breakbeat": T(125, 140), "Breaks": T(125, 135),
  "Progressive Breaks": T(126, 134), "Big Beat": T(110, 135), "Breakcore": T(160, 200), "Hardcore": T(160, 200),
  "Dubstep": T(138, 142), "Halftime": T(160, 175),
  // ambient & around
  "Downtempo": T(80, 110), "Trip Hop": T(80, 100), "Dub": T(65, 90), "Future Jazz": T(100, 125),
  "Acid Jazz": T(95, 120), "Synthwave": T(85, 120), "Chillwave": T(80, 110), "Vaporwave": T(60, 90),
  "Ambient": null, "Dark Ambient": null, "Drone": null, "Noise": null, "Experimental": null, "Abstract": null,
  "IDM": null, "Glitch": null, "Industrial": null, "Rhythmic Noise": null, "Leftfield": null, "Berlin-School": null,
  "Illbient": null, "New Age": null, "Modern Classical": null, "Soundtrack": null, "Field Recording": null,
  "Avantgarde": null, "Instrumental": null, "Folk": null, "Indie Pop": null, "Indie Rock": null,
  "Alternative Rock": null, "Post Rock": null, "Psychedelic Rock": null, "Black Metal": null,
  // electro, wave, bass, hard and the rest of the 13 galaxies
  "Electroclash": T(120, 130), "Coldwave": T(110, 135), "Post-Punk": T(120, 150), "Goth Rock": T(110, 140),
  "Punk": T(150, 190), "Juke": T(155, 165), "Speedcore": T(250, 350), "Jumpstyle": T(140, 150),
  "Balearic": T(100, 120), "Trap": T(130, 150), "Krautrock": null, "Art Rock": null, "Lo-Fi": null,
  "Power Electronics": null, "Musique Concrète": null,
};

const BY_WORD: [RegExp, Tempo][] = [
  [/jungle|drum ?n ?bass/i, T(165, 176)], [/gabber|hardcore|breakcore/i, T(160, 200)], [/hardstyle/i, T(145, 155)],
  [/trance/i, T(130, 140)], [/techno/i, T(125, 140)], [/garage/i, T(128, 135)], [/breaks|breakbeat/i, T(125, 135)],
  [/disco/i, T(110, 125)], [/house/i, T(120, 128)], [/hip ?hop|rap|r&b|rnb/i, T(85, 100)],
  [/ambient|drone|noise|experimental|classical|soundtrack|rock|folk|jazz|metal/i, null],
];

/** typical tempo range of a style; null when it has no steady beat or varies too much */
export function tempoOf(style: string): Tempo {
  if (style in BY_NAME) return BY_NAME[style];
  for (const [re, t] of BY_WORD) if (re.test(style)) return t;
  return null;
}

/** how a star shows it: "≈ 120–128 BPM" or "FREE TEMPO" */
export const tempoLabel = (t: Tempo) => (t ? `${t.lo}–${t.hi} BPM` : "FREE TEMPO");
/** the beat a pulsar keeps: the middle of the range; slow breathing for styles without a beat */
export const pulseBpm = (t: Tempo) => (t ? Math.round((t.lo + t.hi) / 2) : 60);
