'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { LoaderCircle, Pause, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ListenTogether({
  audioRef,
  onPlay,
  onFirstPlayback,
  disabled = false,
}: {
  audioRef: RefObject<HTMLAudioElement | null>;
  onPlay: () => void;
  onFirstPlayback: () => void;
  disabled?: boolean;
}) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const rewarded = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    // Leaving the home tab must not leave invisible music playing.
    return () => audio?.pause();
  }, [audioRef]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || disabled) return;
    setShowPlayer(true);
    setError('');

    if (!audio.paused) {
      audio.pause();
      return;
    }

    setIsLoading(true);
    if (audio.error) audio.load();
    try {
      // Call play directly within the tap, without a preceding fetch/await.
      await audio.play();
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setIsLoading(false);
      setIsPlaying(false);
      setError('暂时无法播放，请再次点击“一起听歌”重试。');
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-11 flex-1 border-white/15 bg-white/[0.06] px-4 text-white hover:bg-white/12 hover:text-white"
        onClick={() => void togglePlayback()}
        disabled={disabled}
        aria-label={
          isLoading
            ? '取消加载歌曲'
            : isPlaying
              ? '暂停《是你》'
              : '一起听歌：播放赵露思《是你》'
        }
        aria-pressed={isPlaying}
      >
        {isLoading ? (
          <LoaderCircle className="animate-spin" />
        ) : isPlaying ? (
          <Pause />
        ) : (
          <Radio />
        )}
        {isLoading ? '取消加载' : isPlaying ? '暂停歌曲' : '一起听歌'}
      </Button>
      <div
        className={`order-last min-w-0 basis-full ${showPlayer ? 'pt-2' : 'hidden'}`}
      >
        <p className="mb-2 text-sm text-white/80">赵露思 ·《是你》</p>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- The supplied MP3 has no caption file; do not invent lyrics or ship an empty track. */}
        <audio
          ref={audioRef}
          src="/audio/zhao-lusi-shi-ni-v1.mp3"
          preload="none"
          controls
          className="h-11 w-full max-w-full"
          aria-label="赵露思《是你》播放器"
          onPlay={(event) => {
            setShowPlayer(true);
            if (disabled) {
              event.currentTarget.pause();
              setError('录音期间请先暂停听歌。');
              return;
            }
            onPlay();
            setError('');
            setIsLoading(true);
          }}
          onPlaying={(event) => {
            if (disabled || event.currentTarget.paused) return;
            setIsLoading(false);
            setIsPlaying(true);
            if (!rewarded.current) {
              rewarded.current = true;
              onFirstPlayback();
            }
          }}
          onWaiting={(event) => {
            if (!event.currentTarget.paused) setIsLoading(true);
          }}
          onPause={() => {
            setIsLoading(false);
            setIsPlaying(false);
          }}
          onEnded={() => {
            setIsLoading(false);
            setIsPlaying(false);
          }}
          onError={() => {
            setIsLoading(false);
            setIsPlaying(false);
            setShowPlayer(true);
            setError('歌曲加载失败，请检查网络后点击“一起听歌”重试。');
          }}
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-[#ffd1c8]">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
