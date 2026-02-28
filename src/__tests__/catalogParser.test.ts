import {parseCatalogPage} from '../services/rezkaService';
import {CATEGORIES} from '../constants/categories';

// ─── Вспомогательные функции ──────────────────────────────────────────────

interface ItemOptions {
  dataUrl?: string;
  posterUrl?: string;
  title?: string;
  misc?: string;
  contentType?: string;
  rating?: string;
}

/** Создаёт HTML-блок одного элемента каталога */
function makeItemBlock({
  dataUrl = '/films/fantasy/12345-film-2024.html',
  posterUrl = '//cdn.rezka.ag/posters/12345.jpg',
  title = 'Тестовый фильм',
  misc = '2024, English',
  contentType = 'Фильм',
  rating = '7.9',
}: ItemOptions = {}): string {
  const miscHtml = misc ? `<div class="misc">${misc}</div>` : '';
  const entityHtml = contentType ? `<i class="entity">${contentType}</i>` : '';
  const ratingHtml = rating ? `<span class="b-category-bestrating">${rating}</span>` : '';
  const posterHtml = posterUrl ? `<img src="${posterUrl}" />` : '';
  return `<div class="b-content__inline_item" data-url="${dataUrl}">
  <div class="b-content__inline_item-link">${posterHtml}</div>
  <div class="b-content__inline_item-2">
    <a href="${dataUrl}">${title}</a>
    ${miscHtml}
    ${entityHtml}
  </div>
  ${ratingHtml}
</div>`;
}

function makePage(items: ItemOptions[]): string {
  return `<html><body><div class="b-content__inline_items">${
    items.map(makeItemBlock).join('\n')
  }</div></body></html>`;
}

// ─── parseCatalogPage ─────────────────────────────────────────────────────

describe('parseCatalogPage', () => {
  it('возвращает пустой массив для пустого HTML', () => {
    expect(parseCatalogPage('')).toEqual([]);
    expect(parseCatalogPage('<html><body></body></html>')).toEqual([]);
  });

  it('парсит один элемент каталога', () => {
    const html = makePage([{}]);
    const result = parseCatalogPage(html);

    expect(result).toHaveLength(1);
    const movie = result[0];
    expect(movie.title).toBe('Тестовый фильм');
    expect(movie.contentType).toBe('Фильм');
    expect(movie.rating).toBe('7.9');
    expect(movie.year).toBe('2024');
  });

  it('парсит несколько элементов каталога', () => {
    const html = makePage([
      {dataUrl: '/films/1-first.html', title: 'Первый'},
      {dataUrl: '/films/2-second.html', title: 'Второй'},
      {dataUrl: '/series/3-third.html', title: 'Третий'},
    ]);
    const result = parseCatalogPage(html);

    expect(result).toHaveLength(3);
    expect(result[0].title).toBe('Первый');
    expect(result[1].title).toBe('Второй');
    expect(result[2].title).toBe('Третий');
  });

  it('добавляет https: к URL постера начинающемуся с //', () => {
    const html = makePage([{posterUrl: '//cdn.rezka.ag/posters/test.jpg'}]);
    const result = parseCatalogPage(html);

    expect(result[0].poster).toBe('https://cdn.rezka.ag/posters/test.jpg');
  });

  it('не изменяет уже абсолютный URL постера', () => {
    const html = makePage([{posterUrl: 'https://cdn.rezka.ag/posters/test.jpg'}]);
    const result = parseCatalogPage(html);

    expect(result[0].poster).toBe('https://cdn.rezka.ag/posters/test.jpg');
  });

  it('правильно формирует fullUrl для относительного data-url', () => {
    const html = makePage([{dataUrl: '/films/fantasy/99-some-film.html'}]);
    const result = parseCatalogPage(html);

    expect(result[0].url).toBe('https://rezka.ag/films/fantasy/99-some-film.html');
  });

  it('не изменяет уже абсолютный data-url', () => {
    const html = makePage([{dataUrl: 'https://rezka.ag/films/1-film.html'}]);
    const result = parseCatalogPage(html);

    expect(result[0].url).toBe('https://rezka.ag/films/1-film.html');
  });

  it('использует последний сегмент data-url как id', () => {
    const html = makePage([{dataUrl: '/films/fantasy/86824-legenda-2025.html'}]);
    const result = parseCatalogPage(html);

    expect(result[0].id).toBe('86824-legenda-2025.html');
  });

  it('извлекает описание из блока misc', () => {
    const html = makePage([{misc: '2023, Фэнтези, Боевик'}]);
    const result = parseCatalogPage(html);

    expect(result[0].description).toBe('2023, Фэнтези, Боевик');
  });

  it('description undefined если блок misc отсутствует', () => {
    const html = makePage([{misc: ''}]);
    const result = parseCatalogPage(html);

    expect(result[0].description).toBeUndefined();
  });

  it('извлекает год из строки misc', () => {
    const html = makePage([{misc: 'Комедия, 2021, США'}]);
    const result = parseCatalogPage(html);

    expect(result[0].year).toBe('2021');
  });

  it('year undefined если в misc нет четырёхзначного числа', () => {
    const html = makePage([{misc: 'Комедия, США'}]);
    const result = parseCatalogPage(html);

    expect(result[0].year).toBeUndefined();
  });

  it('contentType undefined если тег entity отсутствует', () => {
    const html = makePage([{contentType: ''}]);
    const result = parseCatalogPage(html);

    expect(result[0].contentType).toBeUndefined();
  });

  it('пропускает элемент без title', () => {
    // Создаём блок без тега <a>
    const html = `<div class="b-content__inline_item" data-url="/films/1-no-title.html">
  <div class="b-content__inline_item-2"></div>
</div>`;
    const result = parseCatalogPage(html);

    expect(result).toHaveLength(0);
  });

  it('poster undefined если тег img отсутствует', () => {
    const html = makePage([{posterUrl: ''}]);
    const result = parseCatalogPage(html);

    expect(result[0].poster).toBeUndefined();
  });

  it('rating undefined если рейтинг отсутствует', () => {
    const html = makePage([{rating: ''}]);
    const result = parseCatalogPage(html);

    expect(result[0].rating).toBeUndefined();
  });

  it('strips HTML-теги из misc при формировании description', () => {
    const html = makePage([{misc: '<span>2022</span>, <b>Драма</b>'}]);
    const result = parseCatalogPage(html);

    expect(result[0].description).toBe('2022 , Драма');
    expect(result[0].year).toBe('2022');
  });
});

// ─── CATEGORIES ───────────────────────────────────────────────────────────

describe('CATEGORIES', () => {
  it('содержит ровно 7 категорий', () => {
    expect(CATEGORIES).toHaveLength(7);
  });

  it('все категории имеют непустой label', () => {
    CATEGORIES.forEach(cat => {
      expect(cat.label.trim().length).toBeGreaterThan(0);
    });
  });

  it('все категории имеют непустой basePath', () => {
    CATEGORIES.forEach(cat => {
      expect(cat.basePath.trim().length).toBeGreaterThan(0);
    });
  });

  it('все категории имеют непустой filter', () => {
    CATEGORIES.forEach(cat => {
      expect(cat.filter.trim().length).toBeGreaterThan(0);
    });
  });

  it('первые 3 категории используют basePath "new"', () => {
    const newCats = CATEGORIES.slice(0, 3);
    newCats.forEach(cat => {
      expect(cat.basePath).toBe('new');
    });
  });

  it('присутствуют фильтры last, popular, watching', () => {
    const filters = CATEGORIES.map(c => c.filter);
    expect(filters).toContain('last');
    expect(filters).toContain('popular');
    expect(filters).toContain('watching');
  });

  it('все labels уникальны', () => {
    const labels = CATEGORIES.map(c => c.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(CATEGORIES.length);
  });

  it('категории содержат films, series, cartoons, animation', () => {
    const paths = CATEGORIES.map(c => c.basePath);
    expect(paths).toContain('films');
    expect(paths).toContain('series');
    expect(paths).toContain('cartoons');
    expect(paths).toContain('animation');
  });

  it('категория "Последние" — первая', () => {
    expect(CATEGORIES[0].label).toBe('Последние');
    expect(CATEGORIES[0].basePath).toBe('new');
    expect(CATEGORIES[0].filter).toBe('last');
  });
});
