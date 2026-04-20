import * as FileSystem from 'expo-file-system/legacy';

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

async function resolveMediaPlaylist(url: string, depth = 0): Promise<MediaPlaylist> {
  if (depth > 3) throw new Error('Слишком много редиректов M3U8');

  const text = await fetchText(url);

  if (text.includes('#EXT-X-STREAM-INF')) {
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
  localM3u8Uri: string;
  segmentCount: number;
  dirUri: string;
}

/**
 * Возвращает количество уже скачанных сегментов в директории.
 * Используется для определения наличия незавершённой загрузки.
 */
export async function countExistingSegments(outputDir: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(outputDir);
    if (!info.exists) return 0;
    const files = await FileSystem.readDirectoryAsync(outputDir);
    return files.filter(f => f.endsWith('.ts')).length;
  } catch {
    return 0;
  }
}

/**
 * Скачивает HLS-поток сегментами.
 * Если сегмент уже существует на диске — пропускает его (поддержка докачки).
 * При отмене папка НЕ удаляется, чтобы можно было продолжить позже.
 */
export async function downloadHls(params: {
  m3u8Url: string;
  outputDir: string;
  onProgress: (p: HlsDownloadProgress) => void;
  cancelRef: {current: boolean};
}): Promise<HlsDownloadResult> {
  const {m3u8Url, outputDir, onProgress, cancelRef} = params;

  const playlist = await resolveMediaPlaylist(m3u8Url);
  const {segments, text: playlistText} = playlist;

  await FileSystem.makeDirectoryAsync(outputDir, {intermediates: true});

  const segmentLocalNames = segments.map(
    (_, i) => `seg_${String(i).padStart(5, '0')}.ts`,
  );

  // Считаем уже скачанные сегменты — они будут пропущены
  let downloaded = 0;
  const existsFlags: boolean[] = await Promise.all(
    segmentLocalNames.map(async name => {
      const info = await FileSystem.getInfoAsync(`${outputDir}${name}`);
      return info.exists;
    }),
  );
  downloaded = existsFlags.filter(Boolean).length;

  // Сразу показываем стартовый прогресс (если есть докачка)
  if (downloaded > 0) {
    onProgress({
      downloaded,
      total: segments.length,
      percent: (downloaded / segments.length) * 100,
    });
  }

  // Качаем пачками, пропуская уже существующие
  for (let i = 0; i < segments.length; i += PARALLEL_DOWNLOADS) {
    if (cancelRef.current) {
      // Папку НЕ удаляем — пользователь сможет продолжить
      throw new Error('cancelled');
    }

    const batch = segments.slice(i, i + PARALLEL_DOWNLOADS);
    await Promise.all(
      batch.map(async (segUrl, j) => {
        const idx = i + j;
        const localPath = `${outputDir}${segmentLocalNames[idx]}`;

        if (existsFlags[idx]) {
          // Уже скачан — пропускаем
          return;
        }

        await FileSystem.downloadAsync(segUrl, localPath);
        existsFlags[idx] = true;
        downloaded += 1;
        onProgress({
          downloaded,
          total: segments.length,
          percent: (downloaded / segments.length) * 100,
        });
      }),
    );
  }

  // Пишем локальный M3U8 с file:// путями
  let segIdx = 0;
  const localLines = playlistText.split('\n').map(line => {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      return `${outputDir}${segmentLocalNames[segIdx++]}`;
    }
    return line;
  });

  const localM3u8Uri = `${outputDir}video.m3u8`;
  await FileSystem.writeAsStringAsync(localM3u8Uri, localLines.join('\n'), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return {localM3u8Uri, segmentCount: segments.length, dirUri: outputDir};
}
