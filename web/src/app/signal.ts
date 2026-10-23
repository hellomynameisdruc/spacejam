// A track's own address, that survives the map being rebuilt: its YouTube id and its style's name,
// "#sig-<id>.<style>". Shared in COMMS it becomes a card; opened in a browser it flies to the track.
import { chunk, galaxy, tracks } from "./state";

const SIG = /#sig-([A-Za-z0-9_-]{11})\.([^\s#?&]+)/;
export type Signal = { yt: string; star: string };

export function signalHash(s: number, i: number) {
  const ch = chunk(s); if (!ch) return "";
  return `#sig-${ch.yt[i]}.${encodeURIComponent(galaxy.stars[s].name)}`;
}
export const signalLink = (s: number, i: number) => `${location.origin}${location.pathname}${signalHash(s, i)}`;

export function parseSignal(text: string): Signal | null {
  const m = text.match(SIG); if (!m) return null;
  try { return { yt: m[1], star: decodeURIComponent(m[2]) }; } catch { return null; }
}
/** the text with the signal's link taken out (what was said around it) */
export const withoutSignal = (text: string) => text.replace(/\S*#sig-[A-Za-z0-9_-]{11}\.[^\s#?&]+\S*/, "").trim();

const found = new Map<string, { s: number; i: number } | null>(), pending = new Map<string, Promise<{ s: number; i: number } | null>>();
/** where the signal is on this map now, if its style's tracks are loaded (else undefined: ask find()) */
export function placed(sig: Signal) { return found.get(`${sig.yt}.${sig.star}`); }
export function find(sig: Signal) {
  const key = `${sig.yt}.${sig.star}`;
  if (found.has(key)) return Promise.resolve(found.get(key)!);
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const s = galaxy.starIndex(sig.star); if (s < 0) return null;
      const ch = await tracks.load(s).catch(() => null), i = ch ? ch.yt.indexOf(sig.yt) : -1;
      return i >= 0 ? { s, i } : null;
    })().then((r) => { found.set(key, r); pending.delete(key); return r; });
    pending.set(key, p);
  }
  return p;
}
