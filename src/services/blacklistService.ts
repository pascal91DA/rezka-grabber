import AsyncStorage from '@react-native-async-storage/async-storage';
import {Movie} from '../types/Movie';

const KEY = 'blacklist_v1';

export interface BlacklistItem {
  id: string;
  title: string;
  url: string;
  poster?: string;
  addedAt: number;
}

export class BlacklistService {
  private static cache: BlacklistItem[] | null = null;

  static async getAll(): Promise<BlacklistItem[]> {
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
    if (list.some(i => i.id === movie.id)) return;
    list.push({
      id: movie.id,
      title: movie.title,
      url: movie.url,
      poster: movie.poster,
      addedAt: Date.now(),
    });
    this.cache = list;
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  }

  static async remove(id: string): Promise<void> {
    const list = await this.getAll();
    this.cache = list.filter(i => i.id !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(this.cache));
  }

  static async isBlacklisted(id: string): Promise<boolean> {
    const list = await this.getAll();
    return list.some(i => i.id === id);
  }

  static async getIds(): Promise<Set<string>> {
    const list = await this.getAll();
    return new Set(list.map(i => i.id));
  }

  static invalidateCache(): void {
    this.cache = null;
  }
}
