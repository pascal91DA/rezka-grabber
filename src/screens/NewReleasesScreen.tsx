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
import {Category, CATEGORIES} from '../constants/categories';

const H_PADDING = 8;
const GAP = 6;

export const NewReleasesScreen: React.FC = () => {
  const tabBarHeight = useBottomTabBarHeight();
  const {width, height} = useWindowDimensions();
  const numColumns = width > height ? 8 : 4;
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMovies = useCallback(async (category: Category, pageNum: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const results = await RezkaService.getNewReleases(category.basePath, category.filter, pageNum);
      if (append) {
        setMovies(prev => [...prev, ...results]);
      } else {
        setMovies(results);
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
      setPage(1);
      loadMovies(selectedCategory, 1, false);
    }, [selectedCategory, loadMovies]),
  );

  const handleCategorySelect = (category: Category) => {
    if (category.basePath === selectedCategory.basePath && category.filter === selectedCategory.filter) return;
    setSelectedCategory(category);
    setPage(1);
    setHasMore(true);
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadMovies(selectedCategory, nextPage, true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Новинки</Text>
      </View>

      {/* Категории */}
      <View style={styles.categoriesContainer}>
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => `${item.basePath}-${item.filter}`}
          contentContainerStyle={styles.categoriesList}
          renderItem={({item}) => (
            <TouchableOpacity
              style={[
                styles.categoryButton,
                item.basePath === selectedCategory.basePath && item.filter === selectedCategory.filter && styles.categoryButtonActive,
              ]}
              onPress={() => handleCategorySelect(item)}
            >
              <Text
                style={[
                  styles.categoryButtonText,
                  item.basePath === selectedCategory.basePath && item.filter === selectedCategory.filter && styles.categoryButtonTextActive,
                ]}
              >
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
          renderItem={({item}) => <MovieGridCard movie={item} numColumns={numColumns} />}
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
  categoriesList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
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
