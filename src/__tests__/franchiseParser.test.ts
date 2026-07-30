import { parseFranchise } from '../services/rezkaService';

// Фрагмент реальной страницы rezka.ag (Звёздные войны), сокращён до 4 частей
const HTML_WITH_FRANCHISE = `
<div class="b-post__infotable">…</div>
<div class="b-sidetitle"><a href="https://rezka.ag/franchises/109-vse-chasti-zvezdnyh-voyn-latest/" class="b-post__franchise_link_title">Все части &quot;Звёздных войн&quot;</a>:</div>
<div class="b-post__partcontent"> <div class="b-post__partcontent_item" data-url="https://rezka.ag/films/fiction/82305-mandalorec-i-grogu-2026-latest.html"> <div class="td num">13</div> <div class="td title"><a href="https://rezka.ag/films/fiction/82305-mandalorec-i-grogu-2026-latest.html">Мандалорец и Грогу</a></div> <div class="td year">2026 год</div> <div class="td rating"><i class="hd-tooltip rating-green-string tooltipstered">7.04</i></div></div><div class="b-post__partcontent_item" data-url="https://rezka.ag/films/action/32559-zvezdnye-voyny-skayuoker-voshod-2019-latest.html"> <div class="td num">12</div> <div class="td title"><a href="https://rezka.ag/films/action/32559-zvezdnye-voyny-skayuoker-voshod-2019-latest.html">Звёздные Войны: Скайуокер. Восход</a></div> <div class="td year">2019 год</div> <div class="td rating"><i class="hd-tooltip rating-grey-string tooltipstered">6.05</i></div></div><div class="b-post__partcontent_item current"> <div class="td num">8</div> <div class="td title">Звёздные войны: Пробуждение силы</div> <div class="td year">2015 год</div> <div class="td rating"><i class="hd-tooltip rating-green-string tooltipstered">7.06</i></div></div><div class="b-post__partcontent_item" data-url="/films/fantasy/1057-zvezdnye-voyny-epizod-4-novaya-nadezhda-1977-latest.html"> <div class="td num">1</div> <div class="td title"><a href="/films/fantasy/1057-zvezdnye-voyny-epizod-4-novaya-nadezhda-1977-latest.html">Звездные войны: Эпизод 4 – Новая надежда</a></div> <div class="td year">1977 год</div> <div class="td rating"><i class="hd-tooltip rating-green-string tooltipstered">8.11</i></div></div> </div>
<div class="b-post__schedule">Дальше идёт другой контент<div class="td title">Ложный заголовок</div></div>
`;

const HTML_WITHOUT_FRANCHISE = `<html><body><div class="b-post__infotable">Нет франшизы</div></body></html>`;

describe('parseFranchise', () => {
  it('возвращает undefined если блока франшизы нет', () => {
    expect(parseFranchise(HTML_WITHOUT_FRANCHISE)).toBeUndefined();
  });

  it('не падает на пустом HTML', () => {
    expect(() => parseFranchise('')).not.toThrow();
    expect(parseFranchise('')).toBeUndefined();
  });

  it('парсит заголовок франшизы и ссылку на неё', () => {
    const franchise = parseFranchise(HTML_WITH_FRANCHISE)!;
    expect(franchise.title).toBe('Все части "Звёздных войн"');
    expect(franchise.url).toBe('https://rezka.ag/franchises/109-vse-chasti-zvezdnyh-voyn-latest/');
  });

  it('извлекает все части в порядке разметки', () => {
    const franchise = parseFranchise(HTML_WITH_FRANCHISE)!;
    expect(franchise.parts).toHaveLength(4);
    expect(franchise.parts.map((p) => p.num)).toEqual(['13', '12', '8', '1']);
  });

  it('парсит поля части', () => {
    const { parts } = parseFranchise(HTML_WITH_FRANCHISE)!;
    expect(parts[0]).toEqual({
      num: '13',
      title: 'Мандалорец и Грогу',
      year: '2026 год',
      rating: '7.04',
      url: 'https://rezka.ag/films/fiction/82305-mandalorec-i-grogu-2026-latest.html',
      isCurrent: false,
    });
  });

  it('помечает текущую часть и оставляет её без ссылки', () => {
    const { parts } = parseFranchise(HTML_WITH_FRANCHISE)!;
    const current = parts.filter((p) => p.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].title).toBe('Звёздные войны: Пробуждение силы');
    expect(current[0].url).toBeUndefined();
  });

  it('достраивает абсолютный URL из относительного data-url', () => {
    const { parts } = parseFranchise(HTML_WITH_FRANCHISE)!;
    expect(parts[3].url).toBe(
      'https://rezka.ag/films/fantasy/1057-zvezdnye-voyny-epizod-4-novaya-nadezhda-1977-latest.html',
    );
  });

  it('не захватывает контент за пределами блока франшизы', () => {
    const { parts } = parseFranchise(HTML_WITH_FRANCHISE)!;
    expect(parts.some((p) => p.title === 'Ложный заголовок')).toBe(false);
  });

  it('работает без заголовка b-sidetitle', () => {
    const html = `<div class="b-post__partcontent"><div class="b-post__partcontent_item" data-url="/films/1-a.html"><div class="td num">1</div><div class="td title"><a href="/films/1-a.html">Часть 1</a></div></div></div>`;
    const franchise = parseFranchise(html)!;
    expect(franchise.title).toBe('Все части');
    expect(franchise.url).toBeUndefined();
    expect(franchise.parts[0].title).toBe('Часть 1');
    expect(franchise.parts[0].year).toBeUndefined();
    expect(franchise.parts[0].rating).toBeUndefined();
  });
});
