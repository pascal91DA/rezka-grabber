import axios from 'axios';
import {Platform} from 'react-native';
import {Movie} from '../types/Movie';
import {parseVideoUrlFromResponse, parseStreamInfo, applyUrlFixes} from '../utils/streamParser';
import type {StreamQuality, StreamInfo} from '../types/Stream';

const REZKA_URL = 'https://rezka.ag';
const PROXY_URL = 'http://localhost:3001/proxy';

// На вебе используем прокси для обхода CORS, на мобильных - прямые запросы
const BASE_URL = Platform.OS === 'web' ? PROXY_URL : REZKA_URL;

// localStorage параметры для эмуляции реального пользователя
const PERSISTENT_COOKIES = 'pljsquality=1080p Ultra; pljsuserid=xxtb5wpn2b; pljsvolume=1; pljsvolume_updated=1';

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': REZKA_URL,
  'Origin': REZKA_URL,
};

// Создаем экземпляр axios с настройками по умолчанию
const axiosInstance = axios.create({
  headers: COMMON_HEADERS,
  withCredentials: true,
  timeout: 30000,
});

/**
 * Преобразует URL rezka.ag в URL через прокси (только для веба)
 */
function toProxyUrl(url: string): string {
  if (Platform.OS !== 'web') {
    return url;
  }
  return url.replace(REZKA_URL, PROXY_URL);
}

// Хранилище для cookies сессии (PHPSESSID и другие динамические)
let sessionCookies: string | null = null;

/**
 * Получает свежую сессию от сервера
 */
async function getSessionCookies(movieUrl: string): Promise<string> {
  try {
    console.log('[getSessionCookies] Fetching session from:', toProxyUrl(movieUrl));

    const response = await axiosInstance.get(toProxyUrl(movieUrl), {
      headers: {
        'Cookie': PERSISTENT_COOKIES,
      },
    });

    console.log('[getSessionCookies] Response headers:', JSON.stringify(response.headers, null, 2));

    // Пробуем разные варианты имени заголовка
    const setCookieHeaders = response.headers['set-cookie'] ||
      response.headers['Set-Cookie'] ||
      response.headers['SET-COOKIE'];

    if (setCookieHeaders) {
      console.log('[getSessionCookies] Set-Cookie headers found:', setCookieHeaders);

      const cookiesArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
      const cookies = cookiesArray
        .map((cookie: string) => cookie.split(';')[0])
        .join('; ');

      sessionCookies = `${PERSISTENT_COOKIES}; ${cookies}`;
      console.log('[getSessionCookies] Session cookies set:', sessionCookies);
      return sessionCookies;
    }

    // Попробуем извлечь PHPSESSID из HTML если есть
    const html = response.data;
    const phpSessionMatch = html.match(/PHPSESSID['":\s=]+([a-zA-Z0-9]+)/);
    if (phpSessionMatch) {
      sessionCookies = `${PERSISTENT_COOKIES}; PHPSESSID=${phpSessionMatch[1]}`;
      console.log('[getSessionCookies] PHPSESSID extracted from HTML:', phpSessionMatch[1]);
      return sessionCookies;
    }

    console.log('[getSessionCookies] No cookies found, using persistent only');
    sessionCookies = PERSISTENT_COOKIES;
    return sessionCookies;
  } catch (error) {
    console.error('[getSessionCookies] Error:', error);
    sessionCookies = PERSISTENT_COOKIES;
    return sessionCookies;
  }
}

/**
 * Получает актуальные cookies для запросов
 */
function getCookies(): string {
  return sessionCookies || PERSISTENT_COOKIES;
}

export interface Translation {
  id: string;
  title: string;
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
  favs?: string;
}

// Кэш данных страницы для передачи с запросами
let cachedFavs: string = '';
let cachedMovieId: string = '';

export class RezkaService {
  static async getMovieData(url: string): Promise<MovieData> {
    try {
      await getSessionCookies(url);

      const response = await axiosInstance.get(toProxyUrl(url), {
        headers: {
          'Cookie': getCookies(),
        },
      });

      const html = response.data;

      const idMatch = html.match(/data-id="(\d+)"/);
      const movieId = idMatch ? idMatch[1] : '';
      cachedMovieId = movieId;

      // Извлекаем favs - обычно это токен для AJAX запросов
      const favsMatch = html.match(/data-favs="([^"]+)"/);
      cachedFavs = favsMatch ? favsMatch[1] : '';
      console.log('[getMovieData] Extracted favs:', cachedFavs);

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
            title: title,
          });
        }
      }

      const seasons: Season[] = [];
      const seasonsBlockMatch = html.match(/<ul id="simple-seasons-tabs"[^>]*>([\s\S]*?)<\/ul>/i);

      if (seasonsBlockMatch) {
        const seasonsList = seasonsBlockMatch[1];
        const seasonRegex = /<(?:a|li)[^>]*data-tab_id="(\d+)"[^>]*>([^<]+)<\/(?:a|li)>/gi;
        let match;

        while ((match = seasonRegex.exec(seasonsList)) !== null) {
          seasons.push({
            id: match[1],
            title: match[2].trim(),
          });
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
        favs: cachedFavs || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getAvailableStreams(
    movieUrl: string,
    translationId: string,
    season?: string,
    episode?: string,
    retryCount: number = 0
  ): Promise<StreamInfo> {
    try {
      // Всегда получаем свежую сессию перед запросом потоков
      if (!sessionCookies || retryCount > 0) {
        await getSessionCookies(movieUrl);
      }

      const urlParts = movieUrl.split('/');
      const movieIdPart = urlParts[urlParts.length - 1];
      const movieIdMatch = movieIdPart.match(/(\d+)-/);
      const movieId = movieIdMatch ? movieIdMatch[1] : '';

      const params = new URLSearchParams();
      params.append('id', movieId);
      params.append('translator_id', translationId);

      if (season) {
        params.append('season', season);
      }

      if (episode) {
        params.append('episode', episode);
      }

      // Добавляем favs если есть (важно для авторизации запроса)
      if (cachedFavs) {
        params.append('favs', cachedFavs);
      }

      params.append('action', season ? 'get_stream' : 'get_movie');

      const endpoint = season ? `${BASE_URL}/ajax/get_cdn_series/` : `${BASE_URL}/ajax/get_cdn_series/`;

      const cookies = getCookies();

      const response = await axiosInstance.post(endpoint, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': movieUrl,
          'Cookie': cookies,
        },
      });

      console.log('[getAvailableStreams] Response status:', response.status);
      console.log('[getAvailableStreams] Response data:', JSON.stringify(response.data, null, 2));

      if (response.data.success === false) {
        const errorMessage = response.data.message || '';

        // Обрабатываем ошибки сессии и сети - пробуем обновить сессию
        if (errorMessage.includes('Время сессии истекло') ||
          errorMessage.includes('Ошибка сети') ||
          errorMessage.includes('обновите страницу')) {
          if (retryCount < 2) {
            console.log(`[getAvailableStreams] Session error, refreshing... (attempt ${retryCount + 1})`);
            sessionCookies = null; // Сбрасываем cookies
            await getSessionCookies(movieUrl);
            return this.getAvailableStreams(movieUrl, translationId, season, episode, retryCount + 1);
          }
          throw new Error(`Не удалось получить сессию после ${retryCount + 1} попыток: ${errorMessage}`);
        }
        throw new Error(`Server error: ${errorMessage}`);
      }

      if (response.data.url) {
        const rawUrl = response.data.url;
        return parseStreamInfo(rawUrl);
      }

      // Проверяем альтернативные поля где может быть видео
      const possibleFields = ['url', 'src', 'video', 'stream', 'file', 'link', 'player'];
      const foundField = possibleFields.find(field => response.data[field]);

      if (foundField) {
        console.log(`[getAvailableStreams] Found video in field: ${foundField}`);
        return parseStreamInfo(response.data[foundField]);
      }

      console.error('[getAvailableStreams] No video URL found. Available fields:', Object.keys(response.data));
      throw new Error(`Video URL not found in response. Fields: ${Object.keys(response.data).join(', ')}`);
    } catch (error) {
      throw error;
    }
  }

  static async getVideoUrlWithRetry(
    movieUrl: string,
    translationId: string,
    season?: string,
    episode?: string,
    maxRetries: number = 5,
    onProgress?: (attempt: number, maxAttempts: number, quality: string | null) => void
  ): Promise<{ url: string; quality: string; attempts: number }> {
    // Приоритет качества (от лучшего к худшему)
    const qualityPriority = ['1080p Ultra', '1080p', '720p', '480p', '360p', 'unknown'];

    // Храним лучший результат между попытками
    let bestResult: { url: string; quality: string; attempts: number } | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const streamInfo = await this.getAvailableStreams(
          movieUrl,
          translationId,
          season,
          episode
        );

        console.log(`[getVideoUrlWithRetry] Attempt ${attempt}: found ${streamInfo.streams.length} streams`);
        streamInfo.streams.forEach(s => console.log(`  - ${s.quality}: ${s.url.substring(0, 50)}...`));

        // Находим лучший поток из текущего ответа
        const currentBest = streamInfo.selectedStream;
        const currentQuality = currentBest?.quality || 'unknown';

        onProgress?.(attempt, maxRetries, currentQuality);

        if (currentBest) {
          const currentPriority = qualityPriority.indexOf(currentQuality);
          const bestPriority = bestResult ? qualityPriority.indexOf(bestResult.quality) : qualityPriority.length;

          // Если текущий результат лучше сохранённого - обновляем
          if (currentPriority < bestPriority) {
            bestResult = {
              url: applyUrlFixes(currentBest.url),
              quality: currentQuality,
              attempts: attempt
            };
            console.log(`[getVideoUrlWithRetry] New best quality: ${currentQuality}`);
            console.log(`[attempts] ${attempt}`);
          }

          // Если получили максимальное качество (1080p Ultra или 1080p) - сразу возвращаем
          if (currentQuality === '1080p Ultra' || currentQuality === '1080p') {
            console.log(`[getVideoUrlWithRetry] Got good quality (${currentQuality}), returning immediately`);
            return bestResult!;
          }
        }

        // Если это последняя попытка - возвращаем лучшее что есть
        if (attempt === maxRetries) {
          if (bestResult) {
            console.log(`[getVideoUrlWithRetry] Max retries reached, returning best: ${bestResult.quality}`);
            return bestResult;
          }
          throw new Error('Не удалось получить ссылку на видео после всех попыток');
        }

        console.log('-> 3')

        // bug. player frezes here
        // await new Promise(resolve => setTimeout(resolve, 300));

        console.log('-> 4')

      } catch (error) {
        console.error(`[getVideoUrlWithRetry] Attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          // Если есть сохранённый результат - возвращаем его
          if (bestResult) {
            console.log(`[getVideoUrlWithRetry] Error on last attempt, but have saved result: ${bestResult.quality}`);
            return bestResult;
          }
          throw error;
        }
        // bug. player frezes here
        // await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('-> 5')
    }

    throw new Error('Не удалось получить ссылку на видео');
  }

  static async searchMovies(query: string): Promise<Movie[]> {
    try {
      if (!query.trim()) {
        return [];
      }

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
    } catch (error) {
      throw error;
    }
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

        const metaParts = metaInfo.split(',').map(s => s.trim());
        let originalTitle: string | undefined;
        let year: string | undefined;

        if (metaParts.length > 0 && metaParts[0]) {
          originalTitle = metaParts[0];
        }

        if (metaParts.length > 0) {
          const lastPart = metaParts[metaParts.length - 1];
          const yearMatch = lastPart.match(/(\d{4})/);
          if (yearMatch) {
            year = yearMatch[1];
          }
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
    } catch (parseError) {
      // Ignore parse errors
    }

    return movies;
  }
}
