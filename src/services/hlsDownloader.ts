import * as FileSystem from 'expo-file-system/legacy';

// Количество сегментов, качаемых параллельно
const PARALLEL_DOWNLOADS = 4;

function resolveUrl(base: string, path: string): string {
  if (!path || path.startsWith('#')) return '';
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith('/')) {
    const match = base.match(/^(https?:\/\/[^/]+)/);
    return match ? match[1] + path : path;
  }
  const dir = base.substring(0, base.lastIndexOf('/') + 1);
  return dir + path;
}

interface MediaPlaylist {
  url: string;
  text: string;
  segments: string[];
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} при загрузке ${url}`);
  return res.text();
}

/**
 * Получает media-плейлист (с сегментами).
 * Если переданный URL — master-плейлист (несколько качеств),
 * рекурсивно берёт вариант с максимальным BANDWIDTH.
 */
async function resolveMediaPlaylist(url: string, depth = 0): Promise<MediaPlaylist> {
  if (depth > 3) throw new Error('Слишком много редиректов M3U8');

  const text = await fetchText(url);

  if (text.includes('#EXT-X-STREAM-INF')) {
    // Master playlist — выбираем лучшее качество
    let bestBandwidth = -1;
    let bestUrl = '';
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bw = parseInt(line.match(/BANDWIDTH=(\d+)/)?.[1] ?? '0');
        const next = lines[i + 1]?.trim();
        if (next && !next.startsWith('#') && bw > bestBandwidth) {
          bestBandwidth = bw;
          bestUrl = resolveUrl(url, next);
        }
      }
    }
    if (bestUrl) return resolveMediaPlaylist(bestUrl, depth + 1);
    throw new Error('Не удалось найти поток в master-плейлисте');
  }

  // Media playlist
  const lines = text.split('\n');
  const segments: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      const resolved = resolveUrl(url, t);
      if (resolved) segments.push(resolved);
    }
  }

  if (segments.length === 0) throw new Error('M3U8 не содержит сегментов');

  return {url, text, segments};
}

export interface HlsDownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export interface HlsDownloadResult {
  localM3u8Uri: string; // file:// URI для react-native-video
  segmentCount: number;
  dirUri: string;
}

/**
 * Скачивает HLS-поток в локальную директорию.
 * Переписывает M3U8 так, чтобы сегменты ссылались на локальные file:// пути.
 * Возвращает URI к локальному M3U8 — его можно передать в react-native-video.
 */
export async function downloadHls(params: {
  m3u8Url: string;
  outputDir: string; // должен заканчиваться на /
  onProgress: (p: HlsDownloadProgress) => void;
  cancelRef: {current: boolean};
}): Promise<HlsDownloadResult> {
  const {m3u8Url, outputDir, onProgress, cancelRef} = params;

  const playlist = await resolveMediaPlaylist(m3u8Url);
  const {segments, text: playlistText} = playlist;

  // Создаём папку для сегментов
  await FileSystem.makeDirectoryAsync(outputDir, {intermediates: true});

  const segmentLocalNames: string[] = segments.map(
    (_, i) => `seg_${String(i).padStart(5, '0')}.ts`,
  );

  let downloaded = 0;

  // Скачиваем сегменты пачками по PARALLEL_DOWNLOADS
  for (let i = 0; i < segments.length; i += PARALLEL_DOWNLOADS) {
    if (cancelRef.current) {
      // Удаляем частично скачанное
      FileSystem.deleteAsync(outputDir, {idempotent: true}).catch(() => {});
      throw new Error('cancelled');
    }

    const batch = segments.slice(i, i + PARALLEL_DOWNLOADS);
    await Promise.all(
      batch.map((segUrl, j) => {
        const localPath = `${outputDir}${segmentLocalNames[i + j]}`;
        return FileSystem.downloadAsync(segUrl, localPath);
      }),
    );

    downloaded = Math.min(i + PARALLEL_DOWNLOADS, segments.length);
    onProgress({
      downloaded,
      total: segments.length,
      percent: (downloaded / segments.length) * 100,
    });
  }

  // Переписываем M3U8: заменяем URL сегментов на локальные file:// пути
  let segIdx = 0;
  const localLines = playlistText.split('\n').map(line => {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      const localUri = `${outputDir}${segmentLocalNames[segIdx++]}`;
      return localUri;
    }
    return line;
  });

  const localM3u8Text = localLines.join('\n');
  const localM3u8Uri = `${outputDir}video.m3u8`;
  await FileSystem.writeAsStringAsync(localM3u8Uri, localM3u8Text, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return {
    localM3u8Uri,
    segmentCount: segments.length,
    dirUri: outputDir,
  };
}
