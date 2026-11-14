import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

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
  const onErrorRef = useRef(onError);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.unload();
        playerRef.current.detachMediaElement();
        playerRef.current.destroy();
      } catch {
        // ignore teardown errors
      }
      playerRef.current = null;
    }
  }, []);

  const reportError = useCallback((msg: string) => {
    setError(msg);
    setLoading(false);
    onErrorRef.current?.(msg);
  }, []);

  useEffect(() => {
    if (!url || !videoRef.current) {
      return undefined;
    }

    setLoading(true);
    setError(null);
    let cancelled = false;

    const initPlayer = async () => {
      try {
        if (type !== 'flv') {
          reportError('当前仅支持 FLV 直播流播放，请检查设备输出格式');
          return;
        }

        const flvjs = await import('flv.js');
        if (cancelled) {
          return;
        }
        if (!flvjs.default.isSupported()) {
          reportError('当前浏览器不支持 FLV 播放，请使用 Chrome / Edge 最新版本');
          return;
        }

        destroyPlayer();

        const player = flvjs.default.createPlayer(
          { type: 'flv', isLive: true, url },
          { enableWorker: false, enableStashBuffer: false, stashInitialSize: 128, lazyLoad: false, autoCleanupSourceBuffer: true },
        );

        player.attachMediaElement(videoRef.current!);
        player.load();

        player.on(flvjs.default.Events.ERROR, (errorType: string, errorDetail: string) => {
          if (!cancelled) {
            reportError(`播放中断：${errorType} - ${errorDetail}`);
          }
        });

        player.on(flvjs.default.Events.LOADING_COMPLETE, () => {
          if (!cancelled) {
            setLoading(false);
          }
        });

        if (autoPlay) {
          try {
            await player.play();
          } catch {
            // Autoplay can be blocked by the browser; the native controls remain usable.
          }
        }

        if (cancelled) {
          try {
            player.destroy();
          } catch {
            // ignore
          }
          return;
        }

        playerRef.current = player;
        setLoading(false);
      } catch (initError: unknown) {
        const detail = initError instanceof Error ? initError.message : String(initError);
        reportError(`播放器初始化失败：${detail}`);
      }
    };

    void initPlayer();

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [attempt, autoPlay, destroyPlayer, reportError, type, url]);

  const handleRetry = () => {
    setAttempt((value) => value + 1);
  };

  return (
    <div style={{ position: 'relative', width, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
      {loading && !error ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            zIndex: 10,
            color: '#e2e8f0',
          }}
        >
          <Spin />
          <span style={{ fontSize: 13 }}>正在连接视频流…</span>
        </div>
      ) : null}
      {error ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11, background: 'rgba(0,0,0,0.72)', padding: 16 }}>
          <Alert
            type="error"
            showIcon
            message="视频播放失败"
            description={error}
            style={{ maxWidth: 420 }}
            action={(
              <Button size="small" icon={<ReloadOutlined />} onClick={handleRetry}>
                重新连接
              </Button>
            )}
          />
        </div>
      ) : null}
      <video
        ref={videoRef}
        aria-label="实时视频"
        style={{ width: '100%', height, display: 'block', background: '#000' }}
        controls
        muted
        playsInline
      />
    </div>
  );
};

export default VideoPlayer;
