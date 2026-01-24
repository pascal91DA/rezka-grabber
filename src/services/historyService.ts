import AsyncStorage from '@react-native-async-storage/async-storage';
import { Movie } from '../types/Movie';

const HISTORY_KEY = '@rezka_history';
const LAST_WATCH_KEY = '@rezka_last_watch';
const MAX_HISTORY_ITEMS = 10;

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
   * Получает историю просмотров
   */
  static async getHistory(): Promise<Movie[]> {
    try {
      const historyJson = await AsyncStorage.getItem(HISTORY_KEY);
      if (!historyJson) {
        return [];
      }

      const history: Movie[] = JSON.parse(historyJson);
      return history;
    } catch (error) {
      console.error('Error reading history:', error);
      return [];
    }
  }

  /**
   * Добавляет фильм в историю
   * Если фильм уже есть, перемещает его в начало
   */
  static async addToHistory(movie: Movie): Promise<void> {
    try {
      const history = await this.getHistory();

      // Удаляем фильм если он уже есть (чтобы избежать дубликатов)
      const filteredHistory = history.filter(item => item.id !== movie.id);

      // Добавляем фильм в начало
      const newHistory = [movie, ...filteredHistory];

      // Ограничиваем количество элементов
      const trimmedHistory = newHistory.slice(0, MAX_HISTORY_ITEMS);

      // Сохраняем
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmedHistory));

      console.log(`Added "${movie.title}" to history`);
    } catch (error) {
      console.error('Error adding to history:', error);
    }
  }

  /**
   * Очищает всю историю
   */
  static async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
      console.log('History cleared');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }

  /**
   * Удаляет конкретный фильм из истории
   */
  static async removeFromHistory(movieId: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const newHistory = history.filter(item => item.id !== movieId);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      console.log(`Removed movie ${movieId} from history`);
    } catch (error) {
      console.error('Error removing from history:', error);
    }
  }

  /**
   * Сохраняет последний просмотр (для функции "Продолжить просмотр")
   */
  static async saveLastWatch(lastWatch: Omit<LastWatch, 'timestamp'>): Promise<void> {
    try {
      const data: LastWatch = {
        ...lastWatch,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(LAST_WATCH_KEY, JSON.stringify(data));
      console.log(`Saved last watch: ${lastWatch.movie.title}`);
    } catch (error) {
      console.error('Error saving last watch:', error);
    }
  }

  /**
   * Получает последний просмотр
   */
  static async getLastWatch(): Promise<LastWatch | null> {
    try {
      const data = await AsyncStorage.getItem(LAST_WATCH_KEY);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as LastWatch;
    } catch (error) {
      console.error('Error getting last watch:', error);
      return null;
    }
  }

  /**
   * Очищает последний просмотр
   */
  static async clearLastWatch(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LAST_WATCH_KEY);
      console.log('Last watch cleared');
    } catch (error) {
      console.error('Error clearing last watch:', error);
    }
  }
}
