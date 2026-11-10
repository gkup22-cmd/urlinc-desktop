import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { openUrl } from "@/lib/openUrl";

export interface MusicTrack {
  id: number;
  title: string;
  artist: string | null;
  audioUrl: string;
  coverImageUrl: string | null;
  durationSeconds: number | null;
}

type RepeatMode = "none" | "one" | "all";

interface MusicPlayerState {
  queue: MusicTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  minimized: boolean;
  /** URL of the page/playlist the current queue came from. Used by the
   *  player bar's clickable title to navigate back to the source list. */
  queueSource: string | null;
  /** When true the MusicPlayerBar hides itself (e.g. radio cabinet is visible). */
  hidePlayerBar: boolean;
}

interface MusicPlayerActions {
  playQueue: (tracks: MusicTrack[], startIndex?: number, source?: string) => void;
  /** Play a single track and stop when it finishes (no auto-advance). */
  playTrack: (track: MusicTrack, source?: string) => void;
  /** Load the full list but start stopped-auto-advance at startIndex.
   *  Manual next/prev still navigate the full list. */
  playSingleFromQueue: (tracks: MusicTrack[], startIndex?: number, source?: string) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  clearQueue: () => void;
  minimize: () => void;
  restore: () => void;
  playbackErrorUrl: string | null;
  clearPlaybackError: () => void;
  setHidePlayerBar: (v: boolean) => void;
}

type MusicPlayerContextValue = MusicPlayerState & MusicPlayerActions;

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentOriginalUrlRef = useRef<string>("");
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("none");
  const [volume, setVolumeState] = useState(1);
  const [minimized, setMinimized] = useState(false);
  const [queueSource, setQueueSource] = useState<string | null>(null);
  const [hidePlayerBar, setHidePlayerBar] = useState(false);
  const [playbackErrorUrl, setPlaybackErrorUrl] = useState<string | null>(null);
  const shuffledOrder = useRef<number[]>([]);
  // Refs so the audio "ended" event listener always sees current values (avoids stale closure)
  const queueRef = useRef<MusicTrack[]>([]);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>("none");
  // true  = playTrack() was used — single-track intent, stop when done
  // false = playQueue() was used — queue intent, auto-advance
  const singlePlayRef = useRef(false);
  // handleEndedRef always holds the latest handleEnded function.
  // The audio "ended" listener calls handleEndedRef.current() so it always
  // invokes the current-render version, avoiding the stale-closure bug from
  // React 18 Strict Mode double-mounting the useEffect with [] deps.
  const handleEndedRef = useRef<() => void>(() => {});
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime);
    // isNaN doesn't catch Infinity (live streams report duration=Infinity).
    // Treat both NaN and Infinity as unknown — keeps the slider disabled.
    const onDuration = () => setDuration(isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    const onEnded = () => handleEndedRef.current();
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    // On audio error: surface the failed URL so the UI can offer the user
    // a choice rather than silently navigating to a new tab.
    const onError = () => {
      if (singlePlayRef.current && currentOriginalUrlRef.current) {
        setPlaybackErrorUrl(currentOriginalUrlRef.current);
        audio.pause();
        setIsPlaying(false);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Normalize a URL so spaces/special chars in path segments are percent-encoded.
  // Handles both already-encoded URLs (double-encoding safe) and raw URLs.
  function normalizeAudioUrl(raw: string): string {
    try {
      const u = new URL(raw);
      u.pathname = u.pathname.split("/").map((seg) =>
        encodeURIComponent(decodeURIComponent(seg)),
      ).join("/");
      return u.toString();
    } catch {
      return raw;
    }
  }

  const loadAndPlay = useCallback((track: MusicTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    currentOriginalUrlRef.current = track.audioUrl;
    audio.src = normalizeAudioUrl(track.audioUrl);
    audio.load();
    void audio.play().catch((e: unknown) => {
      console.error("[MusicPlayer] playback failed:", e, "\n  url:", track.audioUrl);
    });
  }, []);

  const buildShuffleOrder = useCallback((len: number, startIdx: number) => {
    const arr = Array.from({ length: len }, (_, i) => i).filter((i) => i !== startIdx);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    shuffledOrder.current = [startIdx, ...arr];
  }, []);

  // Assigned in the render body (not in useEffect) so handleEndedRef.current
  // always points to a closure over the current render's state and callbacks.
  handleEndedRef.current = function handleEnded() {
    setCurrentIndex((ci) => {
      const audio = audioRef.current;
      const q = queueRef.current;
      const rep = repeatRef.current;
      const shuf = shuffleRef.current;
      const single = singlePlayRef.current;
      if (!audio || q.length === 0) return ci;

      // ── Repeat one: always replay, regardless of mode ────────────────────
      if (rep === "one") {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
        return ci;
      }

      // ── Single-track mode (playTrack called), shuffle OFF ────────────────
      // User clicked one track — stop when it finishes.
      // "Repeat all" on a lone track is treated as loop-one.
      if (single && !shuf) {
        if (rep === "all") {
          audio.currentTime = 0;
          void audio.play().catch(() => {});
        }
        return ci; // stay at same index, do not advance
      }

      // ── Queue / shuffle mode ─────────────────────────────────────────────
      let nextIdx: number;
      if (shuf) {
        const pos = shuffledOrder.current.indexOf(ci);
        if (pos === -1) {
          // Shuffle order is stale (different queue was playing before).
          // Rebuild from a track other than the one that just finished.
          const nextStart = q.length > 1 ? (ci + 1) % q.length : 0;
          buildShuffleOrder(q.length, nextStart);
          nextIdx = shuffledOrder.current[0];
        } else {
          const nextPos = pos + 1;
          if (nextPos >= shuffledOrder.current.length) {
            if (rep === "all" || (single && shuf)) {
              const nextStart = q.length > 1 ? (ci + 1) % q.length : 0;
              buildShuffleOrder(q.length, nextStart);
              nextIdx = shuffledOrder.current[0];
            } else {
              return ci; // shuffle exhausted, no loop — stop
            }
          } else {
            nextIdx = shuffledOrder.current[nextPos];
          }
        }
        // Hard safety: never play the exact same track twice in a row
        if (nextIdx === ci && q.length > 1) {
          nextIdx = (ci + 1) % q.length;
        }
      } else {
        nextIdx = ci + 1;
        if (nextIdx >= q.length) {
          if (rep === "all") {
            nextIdx = 0;
          } else {
            return ci; // end of queue, no loop — stop
          }
        }
      }

      if (audio && q[nextIdx]) {
        audio.src = q[nextIdx].audioUrl;
        audio.load();
        void audio.play().catch(() => {});
      }
      return nextIdx;
    });
  };

  const playQueue = useCallback((tracks: MusicTrack[], startIndex = 0, source?: string) => {
    singlePlayRef.current = false;  // queue intent → auto-advance allowed
    queueRef.current = tracks;
    setQueue(tracks);
    setCurrentIndex(startIndex);
    setMinimized(false);
    setQueueSource(source ?? null);
    buildShuffleOrder(tracks.length, startIndex);
    if (tracks[startIndex]) loadAndPlay(tracks[startIndex]);
  }, [loadAndPlay, buildShuffleOrder]);

  const playTrack = useCallback((track: MusicTrack, source?: string) => {
    singlePlayRef.current = true;   // single-track intent → stop when done
    queueRef.current = [track];
    setQueue([track]);
    setCurrentIndex(0);
    shuffledOrder.current = [0];
    setQueueSource(source ?? null);
    loadAndPlay(track);
  }, [loadAndPlay]);

  // Load the full list as context but flag single-play so the track
  // auto-stops when it ends. Manual next/prev still navigate the full list.
  const playSingleFromQueue = useCallback((tracks: MusicTrack[], startIndex = 0, source?: string) => {
    singlePlayRef.current = true;   // auto-advance blocked
    queueRef.current = tracks;
    setQueue(tracks);
    setCurrentIndex(startIndex);
    setMinimized(false);
    setQueueSource(source ?? null);
    buildShuffleOrder(tracks.length, startIndex);
    if (tracks[startIndex]) loadAndPlay(tracks[startIndex]);
  }, [loadAndPlay, buildShuffleOrder]);

  const pause = useCallback(() => { audioRef.current?.pause(); }, []);
  const resume = useCallback(() => { void audioRef.current?.play().catch(() => {}); }, []);
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) void audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, []);

  const next = useCallback(() => {
    const audio = audioRef.current;
    const q = queueRef.current;  // always current, never stale
    if (!audio || q.length === 0) return;
    // Manual navigation → user wants to keep going; disable single-play stop
    singlePlayRef.current = false;

    setCurrentIndex((ci) => {
      let nextIdx: number;
      if (shuffle) {
        const pos = shuffledOrder.current.indexOf(ci);
        const nextPos = (pos + 1) % shuffledOrder.current.length;
        nextIdx = shuffledOrder.current[nextPos];
      } else {
        nextIdx = (ci + 1) % q.length;
      }
      if (q[nextIdx]) {
        audio.src = q[nextIdx].audioUrl;
        audio.load();
        void audio.play().catch(() => {});
      }
      return nextIdx;
    });
  }, [shuffle]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    const q = queueRef.current;  // always current, never stale
    if (!audio || q.length === 0) return;
    // Manual navigation → user wants to keep going; disable single-play stop
    singlePlayRef.current = false;

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    setCurrentIndex((ci) => {
      let prevIdx: number;
      if (shuffle) {
        const pos = shuffledOrder.current.indexOf(ci);
        const prevPos = (pos - 1 + shuffledOrder.current.length) % shuffledOrder.current.length;
        prevIdx = shuffledOrder.current[prevPos];
      } else {
        prevIdx = (ci - 1 + q.length) % q.length;
      }
      if (q[prevIdx]) {
        audio.src = q[prevIdx].audioUrl;
        audio.load();
        void audio.play().catch(() => {});
      }
      return prevIdx;
    });
  }, [shuffle]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      if (!s) buildShuffleOrder(queueRef.current.length, currentIndex);
      return !s;
    });
  }, [currentIndex, buildShuffleOrder]);

  const toggleRepeat = useCallback(() => {
    setRepeat((r) => r === "none" ? "one" : r === "one" ? "all" : "none");
  }, []);

  const clearQueue = useCallback(() => {
    audioRef.current?.pause();
    queueRef.current = [];
    singlePlayRef.current = false;
    setQueue([]);
    setCurrentIndex(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setMinimized(false);
    setQueueSource(null);
  }, []);

  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);
  const clearPlaybackError = useCallback(() => setPlaybackErrorUrl(null), []);

  const currentTrack = queue[currentIndex] ?? null;

  // ── Lock-screen / headset controls (Media Session API) ──────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist ?? "URLinc",
      artwork: currentTrack.coverImageUrl
        ? [{ src: currentTrack.coverImageUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });
  }, [currentTrack]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play",          () => { void audioRef.current?.play().catch(() => {}); });
    navigator.mediaSession.setActionHandler("pause",         () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack",     () => next());
    return () => {
      (["play", "pause", "previoustrack", "nexttrack"] as MediaSessionAction[]).forEach((a) => {
        try { navigator.mediaSession.setActionHandler(a, null); } catch { /* not supported */ }
      });
    };
  }, [prev, next]);

  return (
    <MusicPlayerContext.Provider value={{
      queue, currentIndex, isPlaying, currentTime, duration,
      shuffle, repeat, volume, minimized, queueSource,
      hidePlayerBar, setHidePlayerBar,
      playbackErrorUrl, clearPlaybackError,
      playQueue, playTrack, playSingleFromQueue, pause, resume, togglePlay,
      next, prev, seek, setVolume, toggleShuffle, toggleRepeat, clearQueue,
      minimize, restore,
    }}>
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return ctx;
}

export function useCurrentTrack(): MusicTrack | null {
  const { queue, currentIndex } = useMusicPlayer();
  return queue[currentIndex] ?? null;
}
