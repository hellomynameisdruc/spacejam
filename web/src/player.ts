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

  constructor(private mountId: string, private ev: PlayerEvents) {}

  async play(videoId: string) {
    await loadApi();
    if (!this.yt) {
      this.pending = videoId;
      this.yt = new window.YT.Player(this.mountId, {
        width: "100%", height: "100%", videoId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e: any) => { if (this.pending && this.pending !== videoId) e.target.loadVideoById(this.pending); e.target.playVideo(); },
          onStateChange: (e: any) => {
            const S = window.YT.PlayerState;
            if (e.data === S.ENDED) this.ev.onEnded();
            const p = e.data === S.PLAYING;
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

  toggle() {
    if (!this.yt?.getPlayerState) return;
    if (this.playing) this.yt.pauseVideo(); else this.yt.playVideo();
  }
}
