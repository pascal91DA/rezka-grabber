import axios from 'axios';
import {Platform} from 'react-native';
import {Movie} from '../types/Movie';
import {parseStreamInfo, parseSubtitles, applyUrlFixes} from '../utils/streamParser';
import type {StreamInfo, SubtitleTrack} from '../types/Stream';

const REZKA_URL = 'https://rezka.ag';
const PROXY_URL = 'http://localhost:3001/proxy';

const BASE_URL = Platform.OS === 'web' ? PROXY_URL : REZKA_URL;

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
};

const axiosInstance = axios.create({
  headers: COMMON_HEADERS,
  timeout: 30000,
});

function toProxyUrl(url: string): string {
  if (Platform.OS !== 'web') return url;
  return url.replace(REZKA_URL, PROXY_URL);
}

/**
 * Извлекает значение "streams" из HTML страницы rezka.ag.
 * Строка вида: sof.tv.initCDNSeriesEvents(..., {"streams":"...","..."})
 */
export function extractStreamsFromHtml(html: string): string | null {
  const match = html.match(/"streams"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return null;
  try {
    // JSON.parse корректно обработает все escape-последовательности (\/, \\, \n и т.д.)
    return JSON.parse('"' + match[1] + '"');
  } catch {
    return match[1].replace(/\\\//g, '/');
  }
}

/**
 * Парсит slug переводчиков из HTML страницы.
 * Из ссылок вида href=".../{translatorId}-{slug}/{season}-season.html"
 * Возвращает map: translatorId -> "translatorId-slug"
 */
export function parseTranslatorSlugs(html: string): Record<string, string> {
  const slugs: Record<string, string> = {};
  const regex = /href="[^"]*\/(\d+-([\w-]+))\/\d+-season/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const fullSlug = match[1]; // "56-dublyazh"
    const id = fullSlug.split('-')[0]; // "56"
    slugs[id] = fullSlug;
  }
  console.log('[parseTranslatorSlugs] result:', JSON.stringify(slugs));
  return slugs;
}

export interface Translation {
  id: string;
  title: string;
  slug?: string; // e.g. "56-dublyazh", нужен для построения URL эпизодов
}

export interface Season {
  id: string;
  title: string;
}

export interface Episode {
  id: string;
  title: string;
  seasonId: string;
}

export interface MovieData {
  id: string;
  translations: Translation[];
  seasons?: Season[];
  episodes?: Episode[];
}

export class RezkaService {
  static async getMovieData(url: string): Promise<MovieData> {
    const response = await axiosInstance.get(toProxyUrl(url), {
      headers: {'Referer': REZKA_URL},
    });

    const html = response.data;

    const idMatch = html.match(/data-id="(\d+)"/);
    const movieId = idMatch ? idMatch[1] : '';

    // Парсим slug переводчиков из ссылок на сезоны
    const slugMap = parseTranslatorSlugs(html);

    const translations: Translation[] = [];
    const translatorBlockMatch = html.match(/<ul id="translators-list"[^>]*>([\s\S]*?)<\/ul>/i);

    if (translatorBlockMatch) {
      const translatorsList = translatorBlockMatch[1];
      const translationRegex = /<(?:a|li)[^>]*data-translator_id="(\d+)"[^>]*>/gi;
      let match;

      while ((match = translationRegex.exec(translatorsList)) !== null) {
        const translatorId = match[1];
        const fullTag = match[0];
        const titleMatch = fullTag.match(/title="([^"]+)"/);
        const title = titleMatch ? titleMatch[1] : `Перевод ${translatorId}`;

        translations.push({
          id: translatorId,
          title,
          slug: slugMap[translatorId],
        });
      }
    }

    // Если translators-list отсутствует (один перевод без UI выбора) —
    // восстанавливаем translator_id из initCDNSeriesEvents/initCDNMovieEvents
    if (translations.length === 0) {
      const initMatch = html.match(/initCDN(?:Series|Movie)Events\s*\(\s*\d+\s*,\s*(\d+)/);
      const translatorId = initMatch?.[1] ?? Object.keys(slugMap)[0];
      if (translatorId) {
        const slug = slugMap[translatorId];
        const ozMatch = html.match(/озвучке\s+([^<"]+)/i);
        const title = ozMatch?.[1]?.trim() || slug?.split('-').slice(1).join('-') || `Перевод ${translatorId}`;
        console.log('[getMovieData] single translator fallback: id=%s slug=%s title=%s', translatorId, slug, title);
        translations.push({ id: translatorId, title, slug });
      }
    }

    // Если список нашли, но slug не определился — берём из slugMap
    if (translations.length === 1 && !translations[0].slug) {
      const firstSlug = Object.values(slugMap)[0];
      if (firstSlug) translations[0].slug = firstSlug;
    }

    const seasons: Season[] = [];
    const seasonsBlockMatch = html.match(/<ul id="simple-seasons-tabs"[^>]*>([\s\S]*?)<\/ul>/i);

    if (seasonsBlockMatch) {
      const seasonsList = seasonsBlockMatch[1];
      const seasonRegex = /<(?:a|li)[^>]*data-tab_id="(\d+)"[^>]*>([^<]+)<\/(?:a|li)>/gi;
      let match;

      while ((match = seasonRegex.exec(seasonsList)) !== null) {
        seasons.push({id: match[1], title: match[2].trim()});
      }
    }

    const episodes: Episode[] = [];
    const episodesBlockMatch = html.match(/<div id="simple-episodes-tabs"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);

    if (episodesBlockMatch) {
      const episodesList = episodesBlockMatch[1];
      const episodeRegex = /<(?:a|li)[^>]*data-season_id="(\d+)"[^>]*data-episode_id="(\d+)"[^>]*>([^<]+)<\/(?:a|li)>/gi;
      let match;

      while ((match = episodeRegex.exec(episodesList)) !== null) {
        episodes.push({
          id: match[2],
          title: match[3].trim(),
          seasonId: match[1],
        });
      }
    }

    return {
      id: movieId,
      translations,
      seasons: seasons.length > 0 ? seasons : undefined,
      episodes: episodes.length > 0 ? episodes : undefined,
    };
  }

  /**
   * Получает потоки через AJAX-эндпоинт rezka с явным translator_id.
   * Для сериала: POST /ajax/get_cdn_series/  action=get_stream
   * Для фильма:  POST /ajax/get_cdn_movie/   action=get_movie
   */
  private static async getStreamsViaAjax(
    movieId: string,
    translationId: string,
    season?: string,
    episode?: string,
  ): Promise<StreamInfo> {
    const isSeries = !!(season && episode);
    const endpoint = isSeries ? '/ajax/get_cdn_series/' : '/ajax/get_cdn_movie/';

    const params = new URLSearchParams();
    params.append('id', movieId);
    params.append('translator_id', translationId);
    if (isSeries) {
      params.append('season', season!);
      params.append('episode', episode!);
      params.append('action', 'get_stream');
    } else {
      params.append('action', 'get_movie');
    }

    const baseUrl = Platform.OS === 'web' ? PROXY_URL : REZKA_URL;
    const url = `${baseUrl}${endpoint}`;

    console.log('[getStreamsViaAjax] POST', url, 'id:', movieId, 'translator_id:', translationId);

    const response = await axiosInstance.post(url, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': REZKA_URL,
      },
    });

    const data = response.data;
    if (!data?.success || !data?.url) {
      throw new Error(`AJAX вернул неуспешный ответ: ${JSON.stringify(data)}`);
    }

    console.log('[getStreamsViaAjax] Got streams via AJAX');
    const streamInfo = parseStreamInfo(data.url);
    const subtitles = parseSubtitles(data.subtitle);
    // subtitle_lns содержит маппинг {"Русский":"ru","English":"en",...}
    const lns: Record<string, string> = typeof data.subtitle_lns === 'object' && data.subtitle_lns ? data.subtitle_lns : {};
    subtitles.forEach(s => {
      if (lns[s.title]) s.language = lns[s.title];
    });
    streamInfo.subtitles = subtitles;
    console.log('[getStreamsViaAjax] Subtitles:', subtitles.length);
    return streamInfo;
  }

  /**
   * Получает потоки через HTML-парсинг страницы эпизода.
   * URL-паттерн:
   *   Фильм:   {movieBase}/{translatorSlug}.html  (или просто movieUrl)
   *   Сезон:   {movieBase}/{translatorSlug}/{season}-season.html
   *   Эпизод:  {movieBase}/{translatorSlug}/{season}-season/{episode}-episode.html
   */
  private static async getStreamsViaHtml(
    movieUrl: string,
    translatorSlug: string | undefined,
    season?: string,
    episode?: string,
  ): Promise<StreamInfo> {
    const movieBase = movieUrl.replace(/\.html$/, '');
    const slug = translatorSlug;

    let pageUrl: string;
    if (slug && season && episode) {
      pageUrl = `${movieBase}/${slug}/${season}-season/${episode}-episode.html`;
    } else if (slug && season) {
      pageUrl = `${movieBase}/${slug}/${season}-season.html`;
    } else if (slug) {
      pageUrl = `${movieBase}/${slug}.html`;
    } else {
      pageUrl = movieUrl;
    }

    console.log('[getStreamsViaHtml] slug:', slug, 'season:', season, 'episode:', episode, '→ URL:', pageUrl);

    const response = await axiosInstance.get(toProxyUrl(pageUrl), {
      headers: {'Referer': REZKA_URL},
    });

    const streams = extractStreamsFromHtml(response.data);
    if (!streams) {
      console.error('[getStreamsViaHtml] streams not found, URL was:', pageUrl);
      throw new Error('Не удалось найти потоки на странице. Возможно, контент недоступен.');
    }

    console.log('[getStreamsViaHtml] streams found, length:', streams.length);
    return parseStreamInfo(streams);
  }

  /**
   * Получает потоки для конкретной серии/фильма.
   * Сначала пробует AJAX с явным translator_id (надёжный способ учесть выбранный перевод),
   * при неудаче — HTML-парсинг страницы эпизода по slug-URL.
   */
  static async getAvailableStreams(
    movieUrl: string,
    movieId: string,
    translationId: string,
    translatorSlug: string | undefined,
    season?: string,
    episode?: string,
  ): Promise<StreamInfo> {
    if (movieId && translationId) {
      try {
        return await this.getStreamsViaAjax(movieId, translationId, season, episode);
      } catch (ajaxErr) {
        console.warn('[getAvailableStreams] AJAX failed, falling back to HTML:', ajaxErr);
      }
    }

    return await this.getStreamsViaHtml(movieUrl, translatorSlug, season, episode);
  }

  static async getVideoUrlWithRetry(
    movieUrl: string,
    movieId: string,
    translationId: string,
    translatorSlug: string | undefined,
    season?: string,
    episode?: string,
    maxRetries: number = 3,
    onProgress?: (attempt: number, maxAttempts: number, quality: string | null) => void
  ): Promise<{ url: string; quality: string; attempts: number; subtitles: SubtitleTrack[] }> {
    const qualityPriority = ['1080p Ultra', '1080p', '720p', '480p', '360p', 'unknown'];
    let bestResult: { url: string; quality: string; attempts: number; subtitles: SubtitleTrack[] } | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const streamInfo = await this.getAvailableStreams(
          movieUrl,
          movieId,
          translationId,
          translatorSlug,
          season,
          episode,
        );

        console.log(`[getVideoUrlWithRetry] Attempt ${attempt}: found ${streamInfo.streams.length} streams`);
        streamInfo.streams.forEach(s => console.log(`  - ${s.quality}: ${s.url.substring(0, 80)}...`));

        const currentBest = streamInfo.selectedStream;
        const currentQuality = currentBest?.quality || 'unknown';

        onProgress?.(attempt, maxRetries, currentQuality);

        if (currentBest) {
          const currentPriority = qualityPriority.indexOf(currentQuality);
          const bestPriority = bestResult ? qualityPriority.indexOf(bestResult.quality) : qualityPriority.length;

          if (currentPriority < bestPriority) {
            bestResult = {
              url: applyUrlFixes(currentBest.url),
              quality: currentQuality,
              attempts: attempt,
              subtitles: streamInfo.subtitles || [],
            };
            console.log(`[getVideoUrlWithRetry] New best: ${currentQuality}`);
          }

          // Достаточно хорошее качество — возвращаем сразу
          if (currentQuality === '1080p Ultra' || currentQuality === '1080p') {
            return bestResult!;
          }
        }

        if (attempt === maxRetries) {
          if (bestResult) return bestResult;
          throw new Error('Не удалось получить ссылку на видео после всех попыток');
        }

      } catch (error) {
        console.error(`[getVideoUrlWithRetry] Attempt ${attempt} failed:`, error);

        const is503 = (error as any)?.response?.status === 503;
        if (is503) {
          console.log('[getVideoUrlWithRetry] Got 503, stopping retries');
          if (bestResult) return bestResult;
          throw error;
        }

        if (attempt === maxRetries) {
          if (bestResult) return bestResult;
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    throw new Error('Не удалось получить ссылку на видео');
  }

  static async searchMovies(query: string): Promise<Movie[]> {
    if (!query.trim()) return [];

    const params = new URLSearchParams();
    params.append('q', query);

    const response = await axiosInstance.post(
      `${BASE_URL}/engine/ajax/search.php`,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'text/html, */*; q=0.01',
        },
      }
    );

    return this.parseMoviesFromHtml(response.data);
  }

  private static parseMoviesFromHtml(html: string): Movie[] {
    const movies: Movie[] = [];

    try {
      const itemRegex = /<li><a href="([^"]+)">([^<]*)<span class="enty">([^<]+)<\/span>([^<]*)\(([^)]+)\)([^<]*)<span class="rating">.*?>([\d.]+)<\/i>/gi;

      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        const url = match[1];
        const titlePrefix = match[2].trim();
        const title = match[3].trim();
        const titleSuffix = match[4].trim();
        const metaInfo = match[5].trim();
        const ratingText = match[7];

        const metaParts = metaInfo.split(',').map((s: string) => s.trim());
        let originalTitle: string | undefined;
        let year: string | undefined;

        if (metaParts.length > 0 && metaParts[0]) originalTitle = metaParts[0];

        if (metaParts.length > 0) {
          const lastPart = metaParts[metaParts.length - 1];
          const yearMatch = lastPart.match(/(\d{4})/);
          if (yearMatch) year = yearMatch[1];
        }

        const fullTitle = [titlePrefix, title, titleSuffix].filter(s => s).join(' ').trim();

        if (url && title) {
          movies.push({
            id: url.split('/').filter(Boolean).pop() || `movie-${movies.length}`,
            title: fullTitle || title,
            originalTitle,
            year,
            rating: ratingText,
            url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
          });
        }
      }

      if (movies.length === 0) {
        const simpleItemRegex = /<li><a href="([^"]+)">.*?<span class="enty">([^<]+)<\/span>/gi;
        let simpleMatch;

        while ((simpleMatch = simpleItemRegex.exec(html)) !== null) {
          const url = simpleMatch[1];
          const title = simpleMatch[2].trim();

          if (url && title) {
            movies.push({
              id: url.split('/').filter(Boolean).pop() || `movie-${movies.length}`,
              title,
              url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
            });
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    return movies;
  }
}
