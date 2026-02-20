"use client";

import { useEffect, useRef, useState } from "react";

export type VideoSrcInfo = {
  light: string;
  dark?: string;
};

interface StickyVideoPlayerProps {
  videos: VideoSrcInfo[];
  activeIndex: number;
  className?: string;
}

function useVideoTransition(videos: string[], activeIndex: number) {
  const [currentVideoSrc, setCurrentVideoSrc] = useState(videos[0]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previousIndexRef = useRef(activeIndex);

  useEffect(() => {
    if (previousIndexRef.current === activeIndex) return;

    const newVideoSrc = videos[activeIndex];
    if (!newVideoSrc || newVideoSrc === currentVideoSrc) return;

    setIsTransitioning(true);

    const fadeOutTimer = setTimeout(() => {
      setCurrentVideoSrc(newVideoSrc);
      previousIndexRef.current = activeIndex;
    }, 200);

    return () => clearTimeout(fadeOutTimer);
  }, [activeIndex, videos, currentVideoSrc]);

  useEffect(() => {
    if (isTransitioning) {
      const fadeInTimer = setTimeout(() => {
        setIsTransitioning(false);
      }, 100);

      return () => clearTimeout(fadeInTimer);
    }
  }, [currentVideoSrc, isTransitioning]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {
        // Autoplay might be blocked, that's ok
      });
    }
  }, [currentVideoSrc]);

  return { currentVideoSrc, isTransitioning, videoRef };
}

function ThemeVideo({
  videos,
  activeIndex,
  themeClass,
}: {
  videos: string[];
  activeIndex: number;
  themeClass?: string;
}) {
  const { currentVideoSrc, isTransitioning, videoRef } = useVideoTransition(
    videos,
    activeIndex,
  );

  return (
    <video
      ref={videoRef}
      className={`h-full w-full object-cover transition-opacity duration-300 ${
        isTransitioning ? "opacity-0" : "opacity-100"
      } ${themeClass ?? ""}`}
      autoPlay
      loop
      muted
      playsInline
      key={currentVideoSrc}
    >
      <source src={currentVideoSrc} type="video/mp4" />
    </video>
  );
}

export function StickyVideoPlayer({
  videos,
  activeIndex,
  className = "",
}: StickyVideoPlayerProps) {
  const lightVideos = videos.map((v) => v.light);
  const darkVideos = videos.map((v) => v.dark).filter(Boolean) as string[];
  const hasDarkVideos = darkVideos.length === videos.length;

  return (
    <div
      className={`bg-surface-secondary relative aspect-652/440 w-full overflow-hidden rounded-xl ${className}`}
    >
      {/* Debug Label */}
      <div className="absolute top-4 left-4 z-10 rounded-lg bg-black/70 px-3 py-1.5 text-sm font-medium text-white">
        Section {activeIndex + 1}
      </div>

      {hasDarkVideos ? (
        <>
          <ThemeVideo
            videos={lightVideos}
            activeIndex={activeIndex}
            themeClass="dark:hidden"
          />
          <ThemeVideo
            videos={darkVideos}
            activeIndex={activeIndex}
            themeClass="hidden dark:block"
          />
        </>
      ) : (
        <ThemeVideo videos={lightVideos} activeIndex={activeIndex} />
      )}
    </div>
  );
}
