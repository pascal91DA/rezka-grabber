import AsyncStorage from '@react-native-async-storage/async-storage';
import {HistoryService, HistoryEntry, LastWatch} from '../services/historyService';
import {Movie} from '../types/Movie';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ─── Фикстуры ─────────────────────────────────────────────────────────────

const makeMovie = (id: string, title = 'Фильм'): Movie => ({
  id,
  title,
  url: `https://rezka.ag/films/${id}.html`,
});

const makeEntry = (
  movieId: string,
  opts: Partial<Omit<HistoryEntry, 'movie' | 'timestamp'>> = {},
): Omit<HistoryEntry, 'timestamp'> => ({
  movie: makeMovie(movieId),
  ...opts,
});

beforeEach(async () => {
  (AsyncStorage as any).__INTERNAL_MOCK_STORAGE__ = {};
  jest.clearAllMocks();
});

// ─── entryKey ─────────────────────────────────────────────────────────────

describe('HistoryService.entryKey', () => {
  it('возвращает ключ только по id фильма', () => {
    const key = HistoryService.entryKey({movie: makeMovie('123')});
    expect(key).toBe('123::::::');
  });

  it('включает translationId, seasonId, episodeId в ключ', () => {
    const key = HistoryService.entryKey({
      movie: makeMovie('456'),
      translationId: '56',
      seasonId: '2',
      episodeId: '7',
    });
    expect(key).toBe('456::56::2::7');
  });

  it('разные movieId дают разные ключи', () => {
    const k1 = HistoryService.entryKey({movie: makeMovie('1')});
    const k2 = HistoryService.entryKey({movie: makeMovie('2')});
    expect(k1).not.toBe(k2);
  });

  it('одинаковые данные дают одинаковый ключ', () => {
    const entry = {movie: makeMovie('99'), translationId: '56', seasonId: '1', episodeId: '3'};
    expect(HistoryService.entryKey(entry)).toBe(HistoryService.entryKey(entry));
  });

  it('отсутствующие поля заменяются пустой строкой', () => {
    const key = HistoryService.entryKey({
      movie: makeMovie('10'),
      translationId: undefined,
      seasonId: '3',
      episodeId: undefined,
    });
    expect(key).toBe('10::::3::');
  });
});

// ─── getHistory ───────────────────────────────────────────────────────────

describe('HistoryService.getHistory', () => {
  it('возвращает пустой массив если AsyncStorage пуст', async () => {
    const result = await HistoryService.getHistory();
    expect(result).toEqual([]);
  });

  it('возвращает HistoryEntry[] из хранилища', async () => {
    const entry: HistoryEntry = {
      movie: makeMovie('1', 'Тест'),
      timestamp: 1000,
      translationId: '56',
    };
    await AsyncStorage.setItem('@rezka_history', JSON.stringify([entry]));

    const result = await HistoryService.getHistory();
    expect(result).toHaveLength(1);
    expect(result[0].movie.id).toBe('1');
    expect(result[0].translationId).toBe('56');
  });

  it('мигрирует старый формат Movie[] → HistoryEntry[]', async () => {
    const oldFormat: Movie[] = [makeMovie('42', 'Старый'), makeMovie('43', 'Формат')];
    await AsyncStorage.setItem('@rezka_history', JSON.stringify(oldFormat));

    const result = await HistoryService.getHistory();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('movie');
    expect(result[0]).toHaveProperty('timestamp');
    expect(result[0].movie.id).toBe('42');
  });

  it('возвращает пустой массив при невалидном JSON', async () => {
    await AsyncStorage.setItem('@rezka_history', 'not-valid-json{{{');
    const result = await HistoryService.getHistory();
    expect(result).toEqual([]);
  });
});

// ─── addToHistory ─────────────────────────────────────────────────────────

describe('HistoryService.addToHistory', () => {
  it('добавляет запись в пустую историю', async () => {
    await HistoryService.addToHistory(makeEntry('1'));

    const history = await HistoryService.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].movie.id).toBe('1');
    expect(history[0].timestamp).toBeGreaterThan(0);
  });

  it('новая запись помещается в начало списка', async () => {
    await HistoryService.addToHistory(makeEntry('1'));
    await HistoryService.addToHistory(makeEntry('2'));

    const history = await HistoryService.getHistory();
    expect(history[0].movie.id).toBe('2');
    expect(history[1].movie.id).toBe('1');
  });

  it('дублирующая запись перемещается в начало с обновлённым timestamp', async () => {
    const entry = makeEntry('5', {translationId: '56', seasonId: '1', episodeId: '3'});
    await HistoryService.addToHistory(entry);
    await HistoryService.addToHistory(makeEntry('99'));

    const tsBefore = (await HistoryService.getHistory()).find(e => e.movie.id === '5')!.timestamp;

    await new Promise(r => setTimeout(r, 5));
    await HistoryService.addToHistory(entry);

    const history = await HistoryService.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].movie.id).toBe('5');
    expect(history[0].timestamp).toBeGreaterThan(tsBefore);
  });

  it('история не превышает 50 записей', async () => {
    // Заполняем 50 записей
    const entries = Array.from({length: 50}, (_, i) => makeEntry(`movie-${i}`));
    for (const e of entries) {
      await HistoryService.addToHistory(e);
    }

    // Добавляем 51-ю
    await HistoryService.addToHistory(makeEntry('new-51'));

    const history = await HistoryService.getHistory();
    expect(history).toHaveLength(50);
    expect(history[0].movie.id).toBe('new-51');
  });
});

// ─── removeFromHistory ────────────────────────────────────────────────────

describe('HistoryService.removeFromHistory', () => {
  it('удаляет запись по ключу', async () => {
    await HistoryService.addToHistory(makeEntry('1'));
    await HistoryService.addToHistory(makeEntry('2'));

    const keyToRemove = HistoryService.entryKey(makeEntry('1'));
    await HistoryService.removeFromHistory(keyToRemove);

    const history = await HistoryService.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].movie.id).toBe('2');
  });

  it('не трогает другие записи', async () => {
    await HistoryService.addToHistory(makeEntry('10'));
    await HistoryService.addToHistory(makeEntry('20'));
    await HistoryService.addToHistory(makeEntry('30'));

    const keyToRemove = HistoryService.entryKey(makeEntry('20'));
    await HistoryService.removeFromHistory(keyToRemove);

    const history = await HistoryService.getHistory();
    expect(history).toHaveLength(2);
    const ids = history.map(e => e.movie.id);
    expect(ids).toContain('10');
    expect(ids).toContain('30');
    expect(ids).not.toContain('20');
  });

  it('нет ошибки при удалении несуществующего ключа', async () => {
    await HistoryService.addToHistory(makeEntry('1'));
    await expect(
      HistoryService.removeFromHistory('non-existent-key::::'),
    ).resolves.not.toThrow();

    const history = await HistoryService.getHistory();
    expect(history).toHaveLength(1);
  });
});

// ─── clearHistory ─────────────────────────────────────────────────────────

describe('HistoryService.clearHistory', () => {
  it('очищает всю историю', async () => {
    await HistoryService.addToHistory(makeEntry('1'));
    await HistoryService.addToHistory(makeEntry('2'));

    await HistoryService.clearHistory();

    const history = await HistoryService.getHistory();
    expect(history).toEqual([]);
  });
});

// ─── saveLastWatch / getLastWatch ─────────────────────────────────────────

describe('HistoryService.saveLastWatch / getLastWatch', () => {
  it('getLastWatch возвращает null если хранилище пусто', async () => {
    const result = await HistoryService.getLastWatch();
    expect(result).toBeNull();
  });

  it('saveLastWatch сохраняет данные, getLastWatch возвращает их', async () => {
    const data: Omit<LastWatch, 'timestamp'> = {
      movie: makeMovie('77', 'Интерстеллар'),
      translationId: '56',
      translationTitle: 'Дублированный',
      seasonId: '1',
      seasonTitle: 'Сезон 1',
      episodeId: '2',
      episodeTitle: 'Серия 2',
    };

    await HistoryService.saveLastWatch(data);
    const result = await HistoryService.getLastWatch();

    expect(result).not.toBeNull();
    expect(result!.movie.id).toBe('77');
    expect(result!.translationId).toBe('56');
    expect(result!.seasonId).toBe('1');
    expect(result!.episodeId).toBe('2');
    expect(result!.timestamp).toBeGreaterThan(0);
  });

  it('saveLastWatch также добавляет запись в историю', async () => {
    await HistoryService.saveLastWatch({movie: makeMovie('88', 'Дюна')});

    const history = await HistoryService.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].movie.id).toBe('88');
  });

  it('clearLastWatch удаляет последний просмотр', async () => {
    await HistoryService.saveLastWatch({movie: makeMovie('99')});
    await HistoryService.clearLastWatch();

    const result = await HistoryService.getLastWatch();
    expect(result).toBeNull();
  });
});
