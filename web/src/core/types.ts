// Shapes of the data produced by pipeline/build_map.py and of the app's own records.

export type Star = {
  name: string; x: number; y: number; core: number; R: number; n: number; tracks: number; color: string;
  yh?: number[]; hull?: number[]; bub?: [number, number, number][]; orb?: number[];
  /** index of the galaxy (sector) the star belongs to */
  g?: number;
};
/** A galaxy: one sector of the map (House, Techno…), a cloud of its star systems */
export type Nebula = { id: string; name: string; x: number; y: number; r: number; color: string; stars: number; tracks: number };
export type Planet = {
  name: string; s: number; x: number; y: number; r: number; n: number; yr: [number, number];
  ay?: number; o?: number; a?: number; b?: number; xs?: [number, number][]; t0: number; t1: number;
};
export type MapMeta = { sector: string; sample: boolean; releases: number; tracks: number; years?: [number, number] };
export type MapData = { meta: MapMeta; galaxies?: Nebula[]; stars: Star[]; links: [number, number, number][]; planets: Planet[] };
/** Tracks of one star system (tracks/<star>.json) */
export type Chunk = { yt: string[]; t: string[]; a: number[]; yr: number[]; p: number[]; x: number[]; y: number[]; an: string[] };

export type TrackRef = { s: number; i: number };
export type Sel = { kind: "star"; s: number } | { kind: "planet"; p: number } | { kind: "track"; s: number; i: number } | null;
export type PType = "giant" | "ringed" | "ancient" | "young" | "rocky";
export type Vec = { x: number; y: number };
