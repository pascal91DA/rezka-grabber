import {FFmpegKit, ReturnCode} from 'ffmpeg-kit-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

export interface DownloadProgress {
  percent: number;
}

export interface DownloadedItem {
  title: string;
  videoPath: string;
  subtitlePath?: string;
  downloadedAt: number;
  fileSizeBytes?: number;
}

const DOWNLOADS_DIR = FileSystem.documentDirectory + 'downloads/';

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, {intermediates: true});
  }
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[^\wа-яёА-ЯЁ\s.\-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

export class DownloadService {
  /**
   * Скачивает HLS-поток в MP4 через ffmpeg (-c copy, без перекодирования).
   * Субтитры (VTT) скачиваются отдельно.
   * Возвращает функцию отмены.
   */
  static async startDownload(params: {
    videoUrl: string;
    durationSec: number;
    title: string;
    subtitleUrl?: string;
    onProgress: (p: DownloadProgress) => void;
    onComplete: (item: DownloadedItem) => void;
    onError: (e: Error) => void;
  }): Promise<() => void> {
    const {videoUrl, durationSec, title, subtitleUrl, onProgress, onComplete, onError} =
      params;

    await ensureDir();

    const safe = sanitizeFilename(title);
    const videoPath = `${DOWNLOADS_DIR}${safe}.mp4`;
    const subtitlePath = subtitleUrl ? `${DOWNLOADS_DIR}${safe}.vtt` : undefined;

    // Субтитры — лёгкий текстовый файл, скачиваем сразу
    if (subtitleUrl && subtitlePath) {
      try {
        await FileSystem.downloadAsync(subtitleUrl, subtitlePath);
        console.log('[Download] Subtitles saved:', subtitlePath);
      } catch (e) {
        console.warn('[Download] Subtitle download failed:', e);
      }
    }

    console.log('[Download] Starting ffmpeg for:', videoUrl);

    // ffmpeg: скачиваем HLS и пишем в MP4 без перекодирования
    const cmd = `-i "${videoUrl}" -c copy -y "${videoPath}"`;

    let sessionId = -1;

    const session = await FFmpegKit.executeAsync(
      cmd,
      async completedSession => {
        const code = await completedSession.getReturnCode();

        if (ReturnCode.isSuccess(code)) {
          console.log('[Download] ffmpeg succeeded:', videoPath);

          // Копируем в MediaLibrary (папка Downloads)
          try {
            const {status} = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
              const asset = await MediaLibrary.createAssetAsync(videoPath);
              await MediaLibrary.createAlbumAsync('rezka-grabber', asset, false);
              console.log('[Download] Saved to MediaLibrary');
            }
          } catch (e) {
            console.warn('[Download] MediaLibrary copy failed:', e);
          }

          const info = await FileSystem.getInfoAsync(videoPath);
          onComplete({
            title,
            videoPath,
            subtitlePath,
            downloadedAt: Date.now(),
            fileSizeBytes: info.exists && 'size' in info ? info.size : undefined,
          });
        } else if (ReturnCode.isCancel(code)) {
          FileSystem.deleteAsync(videoPath, {idempotent: true}).catch(() => {});
        } else {
          FileSystem.deleteAsync(videoPath, {idempotent: true}).catch(() => {});
          const logs = await completedSession.getAllLogsAsString();
          console.error('[Download] ffmpeg failed. Logs:', logs?.slice(-500));
          onError(new Error('Ошибка ffmpeg при конвертации видео'));
        }
      },
      undefined, // log callback
      statistics => {
        // statistics.getTime() — позиция в миллисекундах
        if (durationSec > 0 && statistics.getTime() > 0) {
          const percent = Math.min(
            (statistics.getTime() / 1000 / durationSec) * 100,
            99,
          );
          onProgress({percent});
        }
      },
    );

    sessionId = session.getSessionId();

    return () => {
      console.log('[Download] Cancelling session', sessionId);
      FFmpegKit.cancel(sessionId);
    };
  }

  static async listDownloads(): Promise<DownloadedItem[]> {
    try {
      await ensureDir();
      const files = await FileSystem.readDirectoryAsync(DOWNLOADS_DIR);
      const mp4Files = files.filter(f => f.endsWith('.mp4'));

      return await Promise.all(
        mp4Files.map(async f => {
          const videoPath = `${DOWNLOADS_DIR}${f}`;
          const subtitleFile = f.replace('.mp4', '.vtt');
          const info = await FileSystem.getInfoAsync(videoPath);
          return {
            title: f.replace('.mp4', '').replace(/_/g, ' '),
            videoPath,
            subtitlePath: files.includes(subtitleFile)
              ? `${DOWNLOADS_DIR}${subtitleFile}`
              : undefined,
            downloadedAt: 0,
            fileSizeBytes: info.exists && 'size' in info ? info.size : undefined,
          } as DownloadedItem;
        }),
      );
    } catch {
      return [];
    }
  }

  static async deleteDownload(videoPath: string): Promise<void> {
    await FileSystem.deleteAsync(videoPath, {idempotent: true});
    await FileSystem.deleteAsync(videoPath.replace('.mp4', '.vtt'), {
      idempotent: true,
    });
  }

  static formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
}
