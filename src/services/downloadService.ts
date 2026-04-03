import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import {downloadHls, HlsDownloadProgress} from './hlsDownloader';

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
}

export interface DownloadedItem {
  title: string;
  /** file:// URI к локальному M3U8 для воспроизведения */
  localM3u8Uri: string;
  /** file:// URI к VTT субтитрам (если были) */
  subtitleUri?: string;
  downloadedAt: number;
  segmentCount: number;
}

const DOWNLOADS_DIR = FileSystem.documentDirectory + 'downloads/';

async function ensureBaseDir(): Promise<void> {
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
    .slice(0, 100);
}

export class DownloadService {
  /**
   * Скачивает HLS-поток сегментами в локальную директорию.
   * Возвращает функцию отмены.
   */
  static async startDownload(params: {
    videoUrl: string;
    title: string;
    subtitleUrl?: string;
    onProgress: (p: DownloadProgress) => void;
    onComplete: (item: DownloadedItem) => void;
    onError: (e: Error) => void;
  }): Promise<() => void> {
    const {videoUrl, title, subtitleUrl, onProgress, onComplete, onError} = params;

    await ensureBaseDir();

    const safe = sanitizeFilename(title);
    const itemDir = `${DOWNLOADS_DIR}${safe}/`;
    const subtitleUri = subtitleUrl ? `${itemDir}subtitles.vtt` : undefined;

    const cancelRef = {current: false};

    // Запускаем асинхронно, не ждём завершения здесь
    (async () => {
      try {
        // Скачиваем субтитры параллельно с началом загрузки
        const subtitlePromise = subtitleUrl && subtitleUri
          ? FileSystem.downloadAsync(subtitleUrl, subtitleUri).catch(e => {
              console.warn('[Download] Subtitle failed:', e);
            })
          : Promise.resolve();

        const result = await downloadHls({
          m3u8Url: videoUrl,
          outputDir: itemDir,
          cancelRef,
          onProgress: (p: HlsDownloadProgress) => {
            onProgress({
              percent: p.percent,
              downloaded: p.downloaded,
              total: p.total,
            });
          },
        });

        await subtitlePromise;

        // Запрашиваем доступ к медиатеке (для уведомления пользователя,
        // сами файлы уже сохранены во внутреннем хранилище)
        MediaLibrary.requestPermissionsAsync().catch(() => {});

        onComplete({
          title,
          localM3u8Uri: result.localM3u8Uri,
          subtitleUri: subtitleUrl ? subtitleUri : undefined,
          downloadedAt: Date.now(),
          segmentCount: result.segmentCount,
        });
      } catch (e: unknown) {
        if (cancelRef.current) return; // тихая отмена
        const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
        if (msg === 'cancelled') return;
        console.error('[Download] Error:', e);
        onError(new Error(msg));
      }
    })();

    return () => {
      cancelRef.current = true;
    };
  }

  static async listDownloads(): Promise<DownloadedItem[]> {
    try {
      await ensureBaseDir();
      const dirs = await FileSystem.readDirectoryAsync(DOWNLOADS_DIR);
      const items: DownloadedItem[] = [];

      for (const dir of dirs) {
        const m3u8Uri = `${DOWNLOADS_DIR}${dir}/video.m3u8`;
        const info = await FileSystem.getInfoAsync(m3u8Uri);
        if (!info.exists) continue;

        const subtitleUri = `${DOWNLOADS_DIR}${dir}/subtitles.vtt`;
        const subInfo = await FileSystem.getInfoAsync(subtitleUri);

        items.push({
          title: dir.replace(/_/g, ' '),
          localM3u8Uri: m3u8Uri,
          subtitleUri: subInfo.exists ? subtitleUri : undefined,
          downloadedAt: 0,
          segmentCount: 0,
        });
      }

      return items;
    } catch {
      return [];
    }
  }

  static async deleteDownload(localM3u8Uri: string): Promise<void> {
    // Удаляем всю папку с сегментами
    const dir = localM3u8Uri.substring(0, localM3u8Uri.lastIndexOf('/') + 1);
    await FileSystem.deleteAsync(dir, {idempotent: true});
  }
}
