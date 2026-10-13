// Обгортка над офіційним YouTube IFrame Player API.
// Ми лише вбудовуємо плеєр YouTube за ID відео — нічого не завантажуємо й не зберігаємо.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void }
}

export type PlayerEvents = {
  onEnded: () => void;
  onError: (code: number) => void;
  onPlayingChange: (playing: boolean) => void;
};

let apiReady: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiReady;
}

export class Player {
  private yt: any = null;
  private pending: string | null = null;
  playing = false;
  buffering = false;

  constructor(private mountId: string, private ev: PlayerEvents) {}

  async play(videoId: string) {
    await loadApi();
    if (!this.yt) {
      this.pending = videoId;
      this.yt = new window.YT.Player(this.mountId, {
        width: "100%", height: "100%", videoId,
        // controls: 0 — the terminal has its own transport; the video itself stays visible
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, controls: 0, iv_load_policy: 3, modestbranding: 1 },
        events: {
          onReady: (e: any) => { e.target.setVolume(this.volume); if (this.pending && this.pending !== videoId) e.target.loadVideoById(this.pending); e.target.playVideo(); },
          onStateChange: (e: any) => {
            const S = window.YT.PlayerState;
            if (e.data === S.ENDED) this.ev.onEnded();
            // buffering after a seek is not a pause: keep "playing" so the UI doesn't flicker
            this.buffering = e.data === S.BUFFERING;
            const p = e.data === S.PLAYING || (this.buffering && this.playing);
            if (p !== this.playing) { this.playing = p; this.ev.onPlayingChange(p); }
          },
          // 100 — відео видалене; 101/150 — власник заборонив вбудовування
          onError: (e: any) => this.ev.onError(e.data),
        },
      });
      return;
    }
    this.pending = videoId;
    if (this.yt.loadVideoById) this.yt.loadVideoById(videoId);
  }

  get ready() { return !!this.yt?.getCurrentTime; }
  time(): number { return this.ready ? this.yt.getCurrentTime() || 0 : 0; }
  duration(): number { return this.ready ? this.yt.getDuration() || 0 : 0; }
  seek(sec: number) { if (this.ready) this.yt.seekTo(sec, true); }
  setVolume(v: number) { this.volume = v; if (this.yt?.setVolume) this.yt.setVolume(v); }
  volume = 80;

  toggle() {
    if (!this.yt?.getPlayerState) return;
    if (this.playing) this.yt.pauseVideo(); else this.yt.playVideo();
  }
}
