import React, {useState, useCallback} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useFocusEffect} from '@react-navigation/native';
import {MovieGridCard} from '../components/MovieGridCard';
import {RezkaService} from '../services/rezkaService';
import {Movie} from '../types/Movie';
import {ContentFilter, ContentType, CONTENT_FILTERS, CONTENT_TYPES} from '../constants/categories';
import {BlacklistService} from '../services/blacklistService';
import {WatchedService} from '../services/watchedService';

const H_PADDING = 8;
const GAP = 6;

export const NewReleasesScreen: React.FC = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const {width, height} = useWindowDimensions();
  const numColumns = width > height ? 8 : 4;
  const [selectedFilter, setSelectedFilter] = useState<ContentFilter>(CONTENT_FILTERS[0]);
  const [selectedType, setSelectedType] = useState<ContentType>(CONTENT_TYPES[0]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blacklistIds, setBlacklistIds] = useState<Set<string>>(new Set());

  const loadMovies = useCallback(async (basePath: string, filter: string, pageNum: number, append: boolean, ids: Set<string>) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const results = await RezkaService.getNewReleases(basePath, filter, pageNum);
      const filtered = results.filter(m => !ids.has(m.id));
      if (append) {
        setMovies(prev => [...prev, ...filtered]);
      } else {
        setMovies(filtered);
      }
      setHasMore(results.length > 0);
    } catch {
      setError('Не удалось загрузить список. Проверьте подключение.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      BlacklistService.invalidateCache();
      WatchedService.invalidateCache();
      Promise.all([BlacklistService.getIds(), WatchedService.getIds()]).then(([bl, wl]) => {
        const ids = new Set([...bl, ...wl]);
        setBlacklistIds(ids);
        setPage(1);
        loadMovies(selectedType.basePath, selectedFilter.filter, 1, false, ids);
      });
    }, [selectedType, selectedFilter, loadMovies]),
  );

  const handleFilterSelect = (f: ContentFilter) => {
    if (f.filter === selectedFilter.filter) return;
    setSelectedFilter(f);
    setPage(1);
    setHasMore(true);
  };

  const handleTypeSelect = (t: ContentType) => {
    if (t.basePath === selectedType.basePath) return;
    setSelectedType(t);
    setPage(1);
    setHasMore(true);
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadMovies(selectedType.basePath, selectedFilter.filter, nextPage, true, blacklistIds);
  };

  const handleHidden = (id: string) => {
    setBlacklistIds(prev => new Set([...prev, id]));
    setMovies(prev => prev.filter(m => m.id !== id));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Новинки</Text>
      </View>

      {/* Фильтр по типу (Последние / Популярные / Смотрят) */}
      <View style={styles.categoriesContainer}>
        <FlatList
          data={CONTENT_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.filter}
          contentContainerStyle={styles.categoriesList}
          renderItem={({item}) => (
            <TouchableOpacity
              style={[styles.categoryButton, item.filter === selectedFilter.filter && styles.categoryButtonActive]}
              onPress={() => handleFilterSelect(item)}
            >
              <Text style={[styles.categoryButtonText, item.filter === selectedFilter.filter && styles.categoryButtonTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Фильтр по контенту (Все / Фильмы / Сериалы / …) */}
      <View style={styles.typeContainer}>
        <FlatList
          data={CONTENT_TYPES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.basePath}
          contentContainerStyle={styles.categoriesList}
          renderItem={({item}) => (
            <TouchableOpacity
              style={[styles.typeButton, item.basePath === selectedType.basePath && styles.typeButtonActive]}
              onPress={() => handleTypeSelect(item)}
            >
              <Text style={[styles.typeButtonText, item.basePath === selectedType.basePath && styles.typeButtonTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#5eb3ff" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setPage(1); loadMovies(selectedCategory, 1, false); }}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={movies}
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          keyExtractor={item => item.id}
          renderItem={({item}) => <MovieGridCard movie={item} numColumns={numColumns} onBlacklisted={handleHidden} />}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.grid,
            movies.length === 0 && styles.emptyGrid,
            {paddingBottom: tabBarHeight},
          ]}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#5eb3ff" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>Нет данных</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  categoriesContainer: {
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  typeContainer: {
    backgroundColor: '#242424',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  categoriesList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  categoryButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#333',
    borderWidth: 1,
    borderColor: '#444',
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#aaa',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  typeButton: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  typeButtonActive: {
    backgroundColor: '#2d4a6e',
    borderColor: '#4a7ab5',
  },
  typeButtonText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: '#7ab4ff',
    fontWeight: '600',
  },
  grid: {
    paddingHorizontal: H_PADDING,
    paddingTop: GAP,
  },
  emptyGrid: {
    flex: 1,
  },
  row: {
    gap: GAP,
    marginBottom: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#aaa',
  },
  errorText: {
    fontSize: 16,
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
