import axios from 'axios';
import { Platform } from 'react-native';
import { Movie } from '../types/Movie';
import { parseStreamInfo, parseSubtitles, applyUrlFixes } from '../utils/streamParser';
import type { StreamInfo, SubtitleTrack } from '../types/Stream';
import { isAnubisChallenge, solveAnubisChallenge } from './anubisService';

const REZKA_URL = 'https://rezka.ag';
const PROXY_URL = 'http://localhost:3001/proxy';

const BASE_URL = Platform.OS === 'web' ? PROXY_URL : REZKA_URL;

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
};

const axiosInstance = axios.create({
  headers: COMMON_HEADERS,
  timeout: 30000,
});

// На native rezka.ag защищён Anubis (proof-of-work anti-bot). Если ответ оказался
// challenge-страницей вместо контента — решаем PoW и повторяем запрос один раз.
// На web этим занимается прокси (proxy-server.js), поэтому пропускаем.
axiosInstance.interceptors.response.use(async (response) => {
  if (Platform.OS === 'web') return response;
  const config = response.config as typeof response.config & { __anubisRetried?: boolean };
  if (isAnubisChallenge(response.data) && !config.__anubisRetried) {
    await solveAnubisChallenge(response.data);
    config.__anubisRetried = true;
    return axiosInstance.request(config);
  }
  return response;
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
  /** Озвучка доступна только по подписке Premium (класс b-prem_translator). */
  premium?: boolean;
}

/** Флаги фильма из data-атрибутов переводчика, нужны для AJAX get_movie. */
interface MovieTranslatorFlags {
  camrip: string;
  ads: string;
  director: string;
}

/**
 * Разбирает теги переводчиков из блока translators-list.
 * rezka выводит список дважды: скрытый (`b-translator__items`, href со случайным
 * префиксом) и видимый (`b-translator__item`, href вида "{id}-{slug}.html").
 * Сливаем по id, предпочитая slug вида "{id}-...".
 */
export function parseTranslatorsList(
  listHtml: string,
): (Translation & { flags: MovieTranslatorFlags })[] {
  const result = new Map<string, Translation & { flags: MovieTranslatorFlags }>();
  const tagRegex = /<(?:a|li)\b[^>]*data-translator_id="(\d+)"[^>]*>/gi;
  let match;
  while ((match = tagRegex.exec(listHtml)) !== null) {
    const id = match[1];
    const tag = match[0];
    const attr = (name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

    const title = (attr('title') ?? `Перевод ${id}`).trim();
    const premium = /\bb-prem_translator\b/.test(attr('class') ?? '');
    const hrefSlug = attr('href')?.match(/\/([^/]+)\.html$/)?.[1];
    const slug = hrefSlug && hrefSlug.startsWith(`${id}-`) ? hrefSlug : undefined;
    const flags: MovieTranslatorFlags = {
      camrip: attr('data-camrip') ?? '0',
      ads: attr('data-ads') ?? '0',
      director: attr('data-director') ?? '0',
    };

    const existing = result.get(id);
    if (existing) {
      if (!existing.slug && slug) existing.slug = slug;
      existing.premium = existing.premium || premium;
    } else {
      result.set(id, { id, title, slug, premium, flags });
    }
  }
  return [...result.values()];
}

// movieId:translatorId -> флаги для get_movie (заполняется в getMovieData).
const movieFlagsCache = new Map<string, MovieTranslatorFlags>();

export interface Season {
  id: string;
  title: string;
}

export interface Episode {
  id: string;
  title: string;
  seasonId: string;
}

/** Одна часть франшизы из блока "Все части ..." */
export interface FranchisePart {
  /** Порядковый номер части внутри франшизы */
  num?: string;
  title: string;
  year?: string;
  rating?: string;
  /** У текущей (открытой) части ссылки нет */
  url?: string;
  isCurrent: boolean;
}

export interface Franchise {
  /** Заголовок блока, например: Все части "Звёздных войн" */
  title: string;
  /** Ссылка на страницу франшизы */
  url?: string;
  parts: FranchisePart[];
}

export interface MovieData {
  id: string;
  translations: Translation[];
  seasons?: Season[];
  episodes?: Episode[];
  franchise?: Franchise;
  /** Популярность озвучек ("Не можешь выбрать озвучку?"), по убыванию. */
  translatorStats?: TranslatorStat[];
}

export interface TranslatorStat {
  title: string;
  /** Доля зрителей в процентах, например 39.73. */
  percent: number;
  /** id перевода из списка translations, если удалось сопоставить по названию. */
  translationId?: string;
}

/**
 * Парсит подсказку «Не можешь выбрать озвучку?» — популярность озвучек.
 * HTML лежит экранированным в title у span.b-rgstats__help:
 *   <li class="b-rgstats__list_item"><div class="inner"><div class="title">Дубляж</div>
 *   <div class="bar" ...></div><div class="count">33,54%</div></div></li>
 */
export function parseTranslatorStats(
  html: string,
  translations: Translation[] = [],
): TranslatorStat[] | undefined {
  const attr = html.match(/<span[^>]*class="[^"]*\bb-rgstats__help\b[^"]*"[^>]*?\stitle="([^"]*)"/i);
  if (!attr) return undefined;
  // Атрибут экранирован (&lt;div class=&quot;title&quot;&gt;) — раскрываем сущности.
  const inner = attr[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');

  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const byTitle = new Map(translations.map((t) => [norm(t.title), t.id]));

  const stats: TranslatorStat[] = [];
  const itemRegex =
    /<div class="title">([\s\S]*?)<\/div>[\s\S]*?<div class="count">\s*([\d.,]+)\s*%/gi;
  let m;
  while ((m = itemRegex.exec(inner)) !== null) {
    const title = stripTags(m[1]);
    const percent = parseFloat(m[2].replace(',', '.'));
    if (!title || Number.isNaN(percent)) continue;
    stats.push({ title, percent, translationId: byTitle.get(norm(title)) });
  }
  if (stats.length === 0) return undefined;
  return stats.sort((a, b) => b.percent - a.percent);
}

/**
 * Парсит страницу каталога rezka.ag и возвращает список фильмов/сериалов.
 */
export function parseCatalogPage(html: string): Movie[] {
  const movies: Movie[] = [];

  // Находим все блоки элементов каталога по data-url
  const blockRegex = /<div[^>]+class="b-content__inline_item"[^>]+data-url="([^"]*)"[^>]*>/gi;
  const blockStarts: { url: string; index: number }[] = [];
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    blockStarts.push({ url: m[1], index: m.index + m[0].length });
  }

  for (let i = 0; i < blockStarts.length; i++) {
    const { url: dataUrl, index: startIdx } = blockStarts[i];
    const endIdx = i + 1 < blockStarts.length ? blockStarts[i + 1].index : startIdx + 2000;
    const blockHtml = html.slice(startIdx, endIdx);

    // Постер
    const posterMatch = blockHtml.match(/<img[^>]+src="((?:https?:)?\/\/[^"]+)"[^>]*>/i);
    let poster = posterMatch?.[1];
    if (poster?.startsWith('//')) poster = 'https:' + poster;

    // Название — берём из первой ссылки в блоке ссылки
    const titleMatch =
      blockHtml.match(
        /<div[^>]+class="b-content__inline_item-2"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i,
      ) ?? blockHtml.match(/<a[^>]+href="[^"]*"[^>]*>\s*([^<\n]{2,80}?)\s*<\/a>/i);
    const title = titleMatch?.[1]?.trim();

    // Рейтинг
    const ratingMatch = blockHtml.match(/b-category-bestrating[^>]*>\s*([0-9.]+)/i);
    const rating = ratingMatch?.[1];

    // Тип контента из <i class="entity">
    const entityMatch = blockHtml.match(/<i[^>]+class="entity"[^>]*>([^<]+)<\/i>/i);
    const contentType = entityMatch?.[1]?.trim() || undefined;

    // Описание и год из .misc
    const miscMatch = blockHtml.match(/class="misc"[^>]*>([\s\S]*?)<\/div>/i);
    const miscRaw = miscMatch?.[1]
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const description = miscRaw || undefined;
    const yearMatch = miscRaw?.match(/(\d{4})/);
    const year = yearMatch?.[1];

    const fullUrl = dataUrl.startsWith('http') ? dataUrl : `${REZKA_URL}${dataUrl}`;
    const id = dataUrl.split('/').filter(Boolean).pop() || `movie-${movies.length}`;

    if (dataUrl && title) {
      movies.push({ id, title, year, rating, url: fullUrl, poster, description, contentType });
    }
  }

  return movies;
}

/** Убирает теги и раскрывает базовые HTML-сущности. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Возвращает содержимое <div>, открывающийся тег которого начинается на openTagStart,
 * с учётом вложенности. Нужно, чтобы не «съесть» конец блока регуляркой.
 */
function extractBalancedDiv(html: string, openTagStart: number): string {
  const tagRegex = /<\/?div\b[^>]*>/gi;
  tagRegex.lastIndex = openTagStart;
  let depth = 0;
  let contentStart = -1;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match[0].startsWith('</')) {
      depth--;
      if (depth === 0) return html.slice(contentStart, match.index);
    } else {
      if (depth === 0) contentStart = match.index + match[0].length;
      depth++;
    }
  }

  return contentStart >= 0 ? html.slice(contentStart) : '';
}

/**
 * Парсит блок "Все части %наименование%" (франшизу) со страницы фильма/сериала.
 * Разметка: <div class="b-sidetitle"><a class="b-post__franchise_link_title">…</a></div>
 *           <div class="b-post__partcontent"><div class="b-post__partcontent_item" data-url="…">…
 * У текущей части класс `current` и нет data-url.
 */
export function parseFranchise(html: string): Franchise | undefined {
  // \b после partcontent не сработает внутри partcontent_item — `_` тоже словесный символ
  const blockMatch = /<div[^>]*class="[^"]*\bb-post__partcontent\b[^"]*"[^>]*>/i.exec(html);
  if (!blockMatch) return undefined;

  const block = extractBalancedDiv(html, blockMatch.index);

  const itemRegex = /<div[^>]*class="[^"]*\bb-post__partcontent_item\b[^"]*"[^>]*>/gi;
  const itemStarts: { tag: string; contentStart: number }[] = [];
  let m;
  while ((m = itemRegex.exec(block)) !== null) {
    itemStarts.push({ tag: m[0], contentStart: m.index + m[0].length });
  }
  if (itemStarts.length === 0) return undefined;

  const parts: FranchisePart[] = [];
  for (let i = 0; i < itemStarts.length; i++) {
    const { tag, contentStart } = itemStarts[i];
    const endIdx =
      i + 1 < itemStarts.length
        ? itemStarts[i + 1].contentStart - itemStarts[i + 1].tag.length
        : block.length;
    const itemHtml = block.slice(contentStart, endIdx);

    const titleRaw = itemHtml.match(/class="[^"]*\btd title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const title = titleRaw ? stripTags(titleRaw) : '';
    if (!title) continue;

    const dataUrl = tag.match(/data-url="([^"]+)"/i)?.[1];
    const href = titleRaw?.match(/<a[^>]+href="([^"]+)"/i)?.[1];
    const rawUrl = dataUrl || href;
    const url = rawUrl
      ? rawUrl.startsWith('http')
        ? rawUrl
        : `${REZKA_URL}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`
      : undefined;

    const num = itemHtml.match(/class="[^"]*\btd num\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const year = itemHtml.match(/class="[^"]*\btd year\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const rating = itemHtml.match(
      /class="[^"]*\btd rating\b[^"]*"[^>]*>[\s\S]*?<i[^>]*>([\s\S]*?)<\/i>/i,
    )?.[1];

    parts.push({
      num: num ? stripTags(num) || undefined : undefined,
      title,
      year: year ? stripTags(year) || undefined : undefined,
      rating: rating ? stripTags(rating) || undefined : undefined,
      url,
      isCurrent: /\bcurrent\b/i.test(tag) || !url,
    });
  }

  if (parts.length === 0) return undefined;

  const titleLink = html.match(
    /<a([^>]*class="[^"]*\bb-post__franchise_link_title\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/i,
  );
  const franchiseTitle = titleLink ? stripTags(titleLink[2]) : 'Все части';
  const franchiseHref = titleLink?.[1].match(/href="([^"]+)"/i)?.[1];

  return {
    title: franchiseTitle,
    url: franchiseHref
      ? franchiseHref.startsWith('http')
        ? franchiseHref
        : `${REZKA_URL}${franchiseHref}`
      : undefined,
    parts,
  };
}

export class RezkaService {
  static async getMovieData(url: string): Promise<MovieData> {
    const response = await axiosInstance.get(toProxyUrl(url), {
      headers: { Referer: REZKA_URL },
    });

    const html = response.data;

    const idMatch = html.match(/data-id="(\d+)"/);
    const movieId = idMatch ? idMatch[1] : '';

    // Парсим slug переводчиков из ссылок на сезоны
    const slugMap = parseTranslatorSlugs(html);

    const translations: Translation[] = [];
    const translatorBlockMatch = html.match(/<ul id="translators-list"[^>]*>([\s\S]*?)<\/ul>/i);

    if (translatorBlockMatch) {
      for (const { flags, ...t } of parseTranslatorsList(translatorBlockMatch[1])) {
        // Для сериалов slug берём из ссылок на сезоны, для фильмов — из href самого перевода.
        translations.push({ ...t, slug: slugMap[t.id] ?? t.slug });
        movieFlagsCache.set(`${movieId}:${t.id}`, flags);
      }
    }

    // Если translators-list отсутствует (один перевод без UI выбора) —
    // восстанавливаем translator_id из initCDNSeriesEvents/initCDNMoviesEvents
    if (translations.length === 0) {
      const initMatch = html.match(/initCDN(?:Series|Movies?)Events\s*\(\s*\d+\s*,\s*(\d+)/);
      const translatorId = initMatch?.[1] ?? Object.keys(slugMap)[0];
      if (translatorId) {
        const slug = slugMap[translatorId];
        const ozMatch = html.match(/озвучке\s+([^<"]+)/i);
        const title =
          ozMatch?.[1]?.trim() || slug?.split('-').slice(1).join('-') || `Перевод ${translatorId}`;
        console.log(
          '[getMovieData] single translator fallback: id=%s slug=%s title=%s',
          translatorId,
          slug,
          title,
        );
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
      const seenSeasons = new Set<string>();

      while ((match = seasonRegex.exec(seasonsList)) !== null) {
        if (seenSeasons.has(match[1])) continue;
        seenSeasons.add(match[1]);
        seasons.push({ id: match[1], title: match[2].trim() });
      }
    }

    const episodes: Episode[] = [];
    const episodesBlockMatch = html.match(
      /<div id="simple-episodes-tabs"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    );

    if (episodesBlockMatch) {
      const episodesList = episodesBlockMatch[1];
      const episodeRegex =
        /<(?:a|li)[^>]*data-season_id="(\d+)"[^>]*data-episode_id="(\d+)"[^>]*>([^<]+)<\/(?:a|li)>/gi;
      let match;
      const seenEpisodes = new Set<string>();

      while ((match = episodeRegex.exec(episodesList)) !== null) {
        const key = `${match[1]}-${match[2]}`;
        if (seenEpisodes.has(key)) continue;
        seenEpisodes.add(key);
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
      franchise: parseFranchise(html),
      translatorStats: parseTranslatorStats(html, translations),
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
      // Без is_camrip/is_ads/is_director rezka может не отдать поток выбранного перевода.
      const flags = movieFlagsCache.get(`${movieId}:${translationId}`);
      params.append('is_camrip', flags?.camrip ?? '0');
      params.append('is_ads', flags?.ads ?? '0');
      params.append('is_director', flags?.director ?? '0');
      params.append('action', 'get_movie');
    }

    const baseUrl = Platform.OS === 'web' ? PROXY_URL : REZKA_URL;
    const url = `${baseUrl}${endpoint}`;

    console.log('[getStreamsViaAjax] POST', url, 'id:', movieId, 'translator_id:', translationId);

    const response = await axiosInstance.post(url, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: REZKA_URL,
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
    const lns: Record<string, string> =
      typeof data.subtitle_lns === 'object' && data.subtitle_lns ? data.subtitle_lns : {};
    subtitles.forEach((s) => {
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

    console.log(
      '[getStreamsViaHtml] slug:',
      slug,
      'season:',
      season,
      'episode:',
      episode,
      '→ URL:',
      pageUrl,
    );

    const response = await axiosInstance.get(toProxyUrl(pageUrl), {
      headers: { Referer: REZKA_URL },
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
   * Загружает список сезонов и серий для конкретного перевода через AJAX.
   * POST /ajax/get_cdn_series/ action=get_episodes возвращает HTML-фрагменты
   * с элементами сезонов и серий именно для переданного translator_id.
   */
  static async getSeasonsAndEpisodes(
    movieId: string,
    translationId: string,
  ): Promise<{ seasons: Season[]; episodes: Episode[] }> {
    const baseUrl = Platform.OS === 'web' ? PROXY_URL : REZKA_URL;
    const url = `${baseUrl}/ajax/get_cdn_series/`;

    const params = new URLSearchParams();
    params.append('id', movieId);
    params.append('translator_id', translationId);
    params.append('action', 'get_episodes');

    const response = await axiosInstance.post(url, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: REZKA_URL,
      },
    });

    const data = response.data;
    const html: string = (data?.seasons ?? '') + (data?.episodes ?? '');

    const seasons: Season[] = [];
    const seasonRegex = /<(?:a|li)[^>]*data-tab_id="(\d+)"[^>]*>([^<]+)<\/(?:a|li)>/gi;
    let m;
    while ((m = seasonRegex.exec(html)) !== null) {
      seasons.push({ id: m[1], title: m[2].trim() });
    }

    const episodes: Episode[] = [];
    const episodeRegex =
      /<(?:a|li)[^>]*data-season_id="(\d+)"[^>]*data-episode_id="(\d+)"[^>]*>([^<]+)<\/(?:a|li)>/gi;
    while ((m = episodeRegex.exec(html)) !== null) {
      episodes.push({ id: m[2], title: m[3].trim(), seasonId: m[1] });
    }

    console.log(
      `[getSeasonsAndEpisodes] translation=${translationId} → ${seasons.length} seasons, ${episodes.length} episodes`,
    );
    return { seasons, episodes };
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
        const ajaxResult = await this.getStreamsViaAjax(movieId, translationId, season, episode);
        const ajaxUrl = ajaxResult.selectedStream?.url ?? '';
        if (!this.isExternalPlayerUrl(ajaxUrl)) {
          return ajaxResult;
        }
        console.warn(
          '[getAvailableStreams] AJAX returned external player URL, falling back to HTML',
        );
      } catch (ajaxErr) {
        console.warn('[getAvailableStreams] AJAX failed, falling back to HTML:', ajaxErr);
      }
    }

    return await this.getStreamsViaHtml(movieUrl, translatorSlug, season, episode);
  }

  static isExternalPlayerUrl(url: string): boolean {
    return /\/(iframe|embed)(\/|$)/.test(url) && !/\.(m3u8|mp4|ts|webm)(\?|:|$)/i.test(url);
  }

  private static isDirectVideoUrl(url: string): boolean {
    // Прямые видео-потоки: MP4, HLS, DASH и т.п.
    if (/\.(mp4|m3u8|ts|webm|mpd)(\?|:|$)/i.test(url)) return true;
    if (url.includes(':hls:') || url.includes('/manifest') || url.includes('/playlist'))
      return true;
    // iframe/embed — внешний плеер, не прямой поток
    if (/\/(iframe|embed)(\/|$)/.test(url)) return false;
    // Неизвестный формат — пробуем играть
    return true;
  }

  static async getVideoUrlWithRetry(
    movieUrl: string,
    movieId: string,
    translationId: string,
    translatorSlug: string | undefined,
    season?: string,
    episode?: string,
    maxRetries: number = 3,
    onProgress?: (attempt: number, maxAttempts: number, quality: string | null) => void,
  ): Promise<{ url: string; quality: string; attempts: number; subtitles: SubtitleTrack[] }> {
    const qualityPriority = ['1080p Ultra', '1080p', '720p', '480p', '360p', 'unknown'];
    let bestResult: {
      url: string;
      quality: string;
      attempts: number;
      subtitles: SubtitleTrack[];
    } | null = null;

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

        console.log(
          `[getVideoUrlWithRetry] Attempt ${attempt}: found ${streamInfo.streams.length} streams`,
        );
        streamInfo.streams.forEach((s) =>
          console.log(`  - ${s.quality}: ${s.url.substring(0, 80)}...`),
        );

        const currentBest = streamInfo.selectedStream;
        const currentQuality = currentBest?.quality || 'unknown';

        onProgress?.(attempt, maxRetries, currentQuality);

        if (currentBest) {
          const currentPriority = qualityPriority.indexOf(currentQuality);
          const bestPriority = bestResult
            ? qualityPriority.indexOf(bestResult.quality)
            : qualityPriority.length;

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
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    throw new Error('Не удалось получить ссылку на видео');
  }

  static async getNewReleases(
    basePath: string,
    filter: string,
    page: number = 1,
  ): Promise<Movie[]> {
    const url =
      page === 1
        ? `${REZKA_URL}/${basePath}/?filter=${filter}`
        : `${REZKA_URL}/${basePath}/page/${page}/?filter=${filter}`;
    const response = await axiosInstance.get(toProxyUrl(url), {
      headers: { Referer: REZKA_URL },
    });
    return parseCatalogPage(response.data);
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
          Accept: 'text/html, */*; q=0.01',
        },
      },
    );

    return this.parseMoviesFromHtml(response.data);
  }

  private static parseMoviesFromHtml(html: string): Movie[] {
    const movies: Movie[] = [];

    try {
      const itemRegex =
        /<li><a href="([^"]+)">([^<]*)<span class="enty">([^<]+)<\/span>([^<]*)\(([^)]+)\)([^<]*)<span class="rating">.*?>([\d.]+)<\/i>/gi;

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

        const fullTitle = [titlePrefix, title, titleSuffix]
          .filter((s) => s)
          .join(' ')
          .trim();

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
