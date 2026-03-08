import React, { useEffect, useRef, useCallback } from 'react';
import { Spin, Alert } from 'antd';

interface VideoPlayerProps {
  url: string;
  type?: 'flv' | 'hls';
  width?: number | string;
  height?: number | string;
  autoPlay?: boolean;
  onError?: (msg: string) => void;
  onDestroy?: () => void;
}

interface FlvPlayer {
  pause: () => void;
  unload: () => void;
  detachMediaElement: () => void;
  destroy: () => void;
  attachMediaElement: (element: HTMLVideoElement) => void;
  load: () => void;
  play: () => void | Promise<void>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  url,
  type = 'flv',
  width = '100%',
  height = 400,
  autoPlay = true,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<FlvPlayer | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.unload();
        playerRef.current.detachMediaElement();
        playerRef.current.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!url || !videoRef.current) return;

    setLoading(true);
    setError(null);

    const initPlayer = async () => {
      try {
        if (type === 'flv') {
          const flvjs = await import('flv.js');
          if (!flvjs.default.isSupported()) {
            const msg = '褰撳墠娴忚鍣ㄤ笉鏀寔 FLV 鎾斁';
            setError(msg);
            onError?.(msg);
            setLoading(false);
            return;
          }

          destroyPlayer();

          const player = flvjs.default.createPlayer({
            type: 'flv',
            isLive: true,
            url: url,
          }, {
            enableWorker: false,
            enableStashBuffer: false,
            stashInitialSize: 128,
            lazyLoad: false,
            autoCleanupSourceBuffer: true,
          });

          player.attachMediaElement(videoRef.current!);
          player.load();

          player.on(flvjs.default.Events.ERROR, (errorType: string, errorDetail: string) => {
            const msg = `鎾斁閿欒: ${errorType} - ${errorDetail}`;
            setError(msg);
            onError?.(msg);
          });

          player.on(flvjs.default.Events.LOADING_COMPLETE, () => {
            setLoading(false);
          });

          if (autoPlay) {
            try {
              await player.play();
            } catch {
              // autoplay may be blocked
            }
          }

          playerRef.current = player;
          setLoading(false);
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        const msg = `鎾斁鍣ㄥ垵濮嬪寲澶辫触: ${errorMessage}`;
        setError(msg);
        onError?.(msg);
        setLoading(false);
      }
    };

    initPlayer();

    return () => {
      destroyPlayer();
    };
  }, [autoPlay, destroyPlayer, onError, type, url]);

  return (
    <div style={{ position: 'relative', width, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
      {loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
          <Spin tip="鍔犺浇涓?.." />
        </div>
      )}
      {error && (
        <Alert type="error" message={error} style={{ margin: 8 }} />
      )}
      <video
        ref={videoRef}
        style={{ width: '100%', height, display: 'block', background: '#000' }}
        controls
        muted
        playsInline
      />
    </div>
  );
};

export default VideoPlayer;
