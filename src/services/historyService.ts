import AsyncStorage from '@react-native-async-storage/async-storage';
import { Movie } from '../types/Movie';

const HISTORY_KEY = '@rezka_history';
const LAST_WATCH_KEY = '@rezka_last_watch';
const MAX_HISTORY_ITEMS = 50;

export interface HistoryEntry {
  movie: Movie;
  translationId?: string;
  translationTitle?: string;
  seasonId?: string;
  seasonTitle?: string;
  episodeId?: string;
  episodeTitle?: string;
  timestamp: number;
}

export interface LastWatch {
  movie: Movie;
  translationId?: string;
  translationTitle?: string;
  seasonId?: string;
  seasonTitle?: string;
  episodeId?: string;
  episodeTitle?: string;
  timestamp: number;
}

export class HistoryService {
  /**
   * Составной ключ для уникальной идентификации записи
   */
  static entryKey(entry: Pick<HistoryEntry, 'movie' | 'translationId' | 'seasonId' | 'episodeId'>): string {
    return [
      entry.movie.id,
      entry.translationId || '',
      entry.seasonId || '',
      entry.episodeId || '',
    ].join('::');
  }

  static async getHistory(): Promise<HistoryEntry[]> {
    try {
      const historyJson = await AsyncStorage.getItem(HISTORY_KEY);
      if (!historyJson) return [];

      const data = JSON.parse(historyJson);
      if (!Array.isArray(data) || data.length === 0) return [];

      // Миграция старого формата Movie[] → HistoryEntry[]
      if ('id' in data[0] && !('movie' in data[0])) {
        return (data as Movie[]).map(movie => ({ movie, timestamp: Date.now() }));
      }

      return data as HistoryEntry[];
    } catch (error) {
      console.error('Error reading history:', error);
      return [];
    }
  }

  /**
   * Добавляет запись в историю.
   * Если запись с таким же ключом уже есть — перемещает в начало с обновлённым timestamp.
   */
  static async addToHistory(entry: Omit<HistoryEntry, 'timestamp'>): Promise<void> {
    try {
      const history = await this.getHistory();
      const key = this.entryKey(entry);

      // Убираем существующую запись с таким же ключом
      const filtered = history.filter(e => this.entryKey(e) !== key);

      const newEntry: HistoryEntry = { ...entry, timestamp: Date.now() };
      const newHistory = [newEntry, ...filtered].slice(0, MAX_HISTORY_ITEMS);

      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      console.log(`Added to history: "${entry.movie.title}" [${key}]`);
    } catch (error) {
      console.error('Error adding to history:', error);
    }
  }

  /**
   * Удаляет конкретную запись по составному ключу
   */
  static async removeFromHistory(key: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const newHistory = history.filter(e => this.entryKey(e) !== key);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      console.log(`Removed history entry: ${key}`);
    } catch (error) {
      console.error('Error removing from history:', error);
    }
  }

  static async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
      console.log('History cleared');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }

  /**
   * Сохраняет последний просмотр и добавляет запись в историю
   */
  static async saveLastWatch(lastWatch: Omit<LastWatch, 'timestamp'>): Promise<void> {
    try {
      const data: LastWatch = { ...lastWatch, timestamp: Date.now() };
      await AsyncStorage.setItem(LAST_WATCH_KEY, JSON.stringify(data));
      console.log(`Saved last watch: ${lastWatch.movie.title}`);

      await this.addToHistory({
        movie: lastWatch.movie,
        translationId: lastWatch.translationId,
        translationTitle: lastWatch.translationTitle,
        seasonId: lastWatch.seasonId,
        seasonTitle: lastWatch.seasonTitle,
        episodeId: lastWatch.episodeId,
        episodeTitle: lastWatch.episodeTitle,
      });
    } catch (error) {
      console.error('Error saving last watch:', error);
    }
  }

  static async getLastWatch(): Promise<LastWatch | null> {
    try {
      const data = await AsyncStorage.getItem(LAST_WATCH_KEY);
      if (!data) return null;
      return JSON.parse(data) as LastWatch;
    } catch (error) {
      console.error('Error getting last watch:', error);
      return null;
    }
  }

  static async clearLastWatch(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LAST_WATCH_KEY);
      console.log('Last watch cleared');
    } catch (error) {
      console.error('Error clearing last watch:', error);
    }
  }
}
