import * as FileSystem from 'expo-file-system/legacy';
import {File} from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import {downloadHls, HlsDownloadProgress, countExistingSegments} from './hlsDownloader';

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
}

export interface ExportProgress {
  /** обработано сегментов */
  current: number;
  /** всего сегментов */
  total: number;
  percent: number;
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
        const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
        // При отмене или cancelled — молча выходим, папка остаётся для докачки
        if (cancelRef.current || msg === 'cancelled') return;
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

  /**
   * Возвращает упорядоченный список file:// URI сегментов из локального M3U8.
   */
  private static async readSegmentUris(localM3u8Uri: string): Promise<string[]> {
    const text = await FileSystem.readAsStringAsync(localM3u8Uri);
    return text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'));
  }

  /**
   * Экспортирует скачанный HLS-ролик в один файл .ts и сохраняет его
   * в системную медиатеку устройства (галерею).
   *
   * Сегменты склеиваются потоково через FileHandle — в память загружается
   * только один сегмент за раз, поэтому работает и для больших фильмов.
   *
   * @returns название альбома/директории, куда сохранён файл
   */
  static async exportToDevice(params: {
    localM3u8Uri: string;
    title: string;
    onProgress?: (p: ExportProgress) => void;
  }): Promise<void> {
    const {localM3u8Uri, title, onProgress} = params;

    // Запрашиваем доступ к медиатеке заранее
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Нет доступа к медиатеке устройства');
    }

    const segmentUris = await DownloadService.readSegmentUris(localM3u8Uri);
    if (segmentUris.length === 0) {
      throw new Error('Не найдены сегменты для экспорта');
    }

    const safe = sanitizeFilename(title) || 'video';
    const tmpFile = new File(FileSystem.cacheDirectory + `${safe}.ts`);
    if (tmpFile.exists) {
      tmpFile.delete();
    }
    tmpFile.create();

    const handle = tmpFile.open();
    try {
      let current = 0;
      for (const segUri of segmentUris) {
        const segFile = new File(segUri);
        if (!segFile.exists) {
          continue;
        }
        // Читаем сегмент целиком и дописываем в выходной файл.
        // Один сегмент HLS — несколько мегабайт, в памяти он недолго.
        handle.writeBytes(segFile.bytesSync());
        current += 1;
        onProgress?.({
          current,
          total: segmentUris.length,
          percent: (current / segmentUris.length) * 100,
        });
      }
    } finally {
      handle.close();
    }

    try {
      await MediaLibrary.saveToLibraryAsync(tmpFile.uri);
    } finally {
      // Временный файл больше не нужен — медиатека хранит свою копию
      if (tmpFile.exists) {
        tmpFile.delete();
      }
    }
  }

  static async deleteDownload(localM3u8Uri: string): Promise<void> {
    const dir = localM3u8Uri.substring(0, localM3u8Uri.lastIndexOf('/') + 1);
    await FileSystem.deleteAsync(dir, {idempotent: true});
  }

  /**
   * Проверяет, есть ли незавершённая загрузка для данного заголовка.
   * Возвращает количество уже скачанных сегментов (0 если нет).
   */
  static async getPartialDownloadCount(title: string): Promise<number> {
    const safe = sanitizeFilename(title);
    const itemDir = `${DOWNLOADS_DIR}${safe}/`;
    const m3u8Uri = `${itemDir}video.m3u8`;
    // Если video.m3u8 уже есть — загрузка завершена
    const doneInfo = await FileSystem.getInfoAsync(m3u8Uri);
    if (doneInfo.exists) return 0;
    return countExistingSegments(itemDir);
  }
}
