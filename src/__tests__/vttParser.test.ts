import {parseVtt, getCurrentCue} from '../utils/vttParser';

// ─── parseVtt ─────────────────────────────────────────────────────────────────

describe('parseVtt', () => {
  it('парсит минимальный валидный VTT', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
Привет, мир!`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toEqual({start: 1, end: 3, text: 'Привет, мир!'});
  });

  it('парсит несколько кью', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Первая строка

00:00:05.000 --> 00:00:07.500
Вторая строка`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Первая строка');
    expect(cues[1].text).toBe('Вторая строка');
  });

  it('парсит тайминг с часами (HH:MM:SS.mmm)', () => {
    const vtt = `WEBVTT

01:15:04.000 --> 01:15:06.500
Текст`;
    const cues = parseVtt(vtt);
    expect(cues[0].start).toBeCloseTo(1 * 3600 + 15 * 60 + 4, 3);
    expect(cues[0].end).toBeCloseTo(1 * 3600 + 15 * 60 + 6.5, 3);
  });

  it('парсит тайминг без часов (MM:SS.mmm)', () => {
    const vtt = `WEBVTT

01:15.040 --> 01:18.040
Текст`;
    const cues = parseVtt(vtt);
    expect(cues[0].start).toBeCloseTo(75.04, 3);
    expect(cues[0].end).toBeCloseTo(78.04, 3);
  });

  it('корректно парсит end когда после него есть позиционирование', () => {
    // Баг: timingParts[1] начинается с пробела → split(' ')[0] = ''
    const vtt = `WEBVTT

00:01:15.040 --> 00:01:18.040 position:80% line:85%
Текст с позиционированием`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBeCloseTo(75.04, 3);
    expect(cues[0].end).toBeCloseTo(78.04, 3);
  });

  it('пропускает кью с числовым ID перед таймингом', () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:02.000
Текст с ID

2
00:00:03.000 --> 00:00:04.000
Второй текст`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Текст с ID');
    expect(cues[1].text).toBe('Второй текст');
  });

  it('пропускает кью с текстовым ID', () => {
    const vtt = `WEBVTT

intro
00:00:01.000 --> 00:00:03.000
Вступление`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Вступление');
  });

  it('парсит многострочный текст кью', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Первая строка текста
Вторая строка текста`;
    const cues = parseVtt(vtt);
    expect(cues[0].text).toBe('Первая строка текста\nВторая строка текста');
  });

  it('удаляет HTML-теги из текста', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
<i>Курсив</i> и <b>жирный</b>

00:00:03.000 --> 00:00:04.000
<c.color>Цветной текст</c.color>`;
    const cues = parseVtt(vtt);
    expect(cues[0].text).toBe('Курсив и жирный');
    expect(cues[1].text).toBe('Цветной текст');
  });

  it('пропускает блоки без тайминга (WEBVTT header, NOTE)', () => {
    const vtt = `WEBVTT

NOTE это комментарий

00:00:01.000 --> 00:00:02.000
Реальный текст`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Реальный текст');
  });

  it('пропускает кью с пустым текстом', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
<i></i>

00:00:03.000 --> 00:00:04.000
Нормальный текст`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Нормальный текст');
  });

  it('обрабатывает переносы строк Windows (CRLF)', () => {
    const vtt = 'WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nТекст\r\n';
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Текст');
  });

  it('возвращает пустой массив для пустого файла', () => {
    expect(parseVtt('')).toEqual([]);
  });

  it('возвращает пустой массив если нет кью', () => {
    expect(parseVtt('WEBVTT\n\nNOTE только комментарий')).toEqual([]);
  });
});

// ─── getCurrentCue ────────────────────────────────────────────────────────────

describe('getCurrentCue', () => {
  const cues = [
    {start: 1, end: 3, text: 'Первый'},
    {start: 5, end: 8, text: 'Второй'},
    {start: 10, end: 12, text: 'Третий'},
  ];

  it('возвращает текст когда время внутри кью', () => {
    expect(getCurrentCue(cues, 2)).toBe('Первый');
    expect(getCurrentCue(cues, 6)).toBe('Второй');
    expect(getCurrentCue(cues, 11)).toBe('Третий');
  });

  it('возвращает текст на границе start', () => {
    expect(getCurrentCue(cues, 1)).toBe('Первый');
    expect(getCurrentCue(cues, 5)).toBe('Второй');
  });

  it('возвращает текст на границе end', () => {
    expect(getCurrentCue(cues, 3)).toBe('Первый');
    expect(getCurrentCue(cues, 8)).toBe('Второй');
  });

  it('возвращает null между кью', () => {
    expect(getCurrentCue(cues, 4)).toBeNull();
    expect(getCurrentCue(cues, 9)).toBeNull();
  });

  it('возвращает null до первого кью', () => {
    expect(getCurrentCue(cues, 0)).toBeNull();
    expect(getCurrentCue(cues, 0.99)).toBeNull();
  });

  it('возвращает null после последнего кью', () => {
    expect(getCurrentCue(cues, 12.01)).toBeNull();
    expect(getCurrentCue(cues, 9999)).toBeNull();
  });

  it('возвращает null для пустого массива', () => {
    expect(getCurrentCue([], 5)).toBeNull();
  });
});
