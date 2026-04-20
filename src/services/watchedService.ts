import AsyncStorage from '@react-native-async-storage/async-storage';
import {Movie} from '../types/Movie';

const KEY = 'watched_v1';

export interface WatchedItem {
  id: string;
  title: string;
  url: string;
  poster?: string;
  watchedAt: number;
}

export class WatchedService {
  private static cache: WatchedItem[] | null = null;

  static async getAll(): Promise<WatchedItem[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      this.cache = raw ? JSON.parse(raw) : [];
    } catch {
      this.cache = [];
    }
    return this.cache!;
  }

  static async add(movie: Movie): Promise<void> {
    const list = await this.getAll();
    const existing = list.findIndex(i => i.id === movie.id);
    const item: WatchedItem = {
      id: movie.id,
      title: movie.title,
      url: movie.url,
      poster: movie.poster,
      watchedAt: Date.now(),
    };
    if (existing !== -1) {
      list[existing] = item;
    } else {
      list.unshift(item);
    }
    this.cache = list;
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  }

  static async remove(id: string): Promise<void> {
    const list = await this.getAll();
    this.cache = list.filter(i => i.id !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(this.cache));
  }

  static async getIds(): Promise<Set<string>> {
    const list = await this.getAll();
    return new Set(list.map(i => i.id));
  }

  static invalidateCache(): void {
    this.cache = null;
  }
}
