import React, {useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {MovieCard} from '../components/MovieCard';
import {RezkaService} from '../services/rezkaService';
import {HistoryService, HistoryEntry, LastWatch} from '../services/historyService';
import {Movie} from '../types/Movie';
import {RootStackParamList} from '../types/navigation';

export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastWatch, setLastWatch] = useState<LastWatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загружаем историю при фокусе на экране
  useFocusEffect(
    React.useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    try {
      const [entries, savedLastWatch] = await Promise.all([
        HistoryService.getHistory(),
        HistoryService.getLastWatch(),
      ]);
      // Показываем уникальные фильмы (первое вхождение каждого movie.id)
      const seen = new Set<string>();
      const unique = entries.filter(e => {
        if (seen.has(e.movie.id)) return false;
        seen.add(e.movie.id);
        return true;
      });
      setHistory(unique);
      setLastWatch(savedLastWatch);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const handleContinueWatching = () => {
    if (!lastWatch) return;
    navigation.navigate('Player', {
      movie: lastWatch.movie,
      resume: {
        translationId: lastWatch.translationId,
        seasonId: lastWatch.seasonId,
        episodeId: lastWatch.episodeId,
      },
    });
  };

  const handleDismissLastWatch = async () => {
    await HistoryService.clearLastWatch();
    setLastWatch(null);
  };

  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);

    if (!searchQuery.trim()) {
      setMovies([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await RezkaService.searchMovies(searchQuery);
      setMovies(results);

      if (results.length === 0) {
        setError('Фильмы не найдены');
      }
    } catch (err) {
      setError('Ошибка при поиске. Проверьте подключение к интернету.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderEmptyComponent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#5eb3ff"/>
          <Text style={styles.loadingText}>Поиск...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    // Показываем историю только если нет поискового запроса
    if (!query.trim() && history.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.placeholderText}>
            Введите название фильма для поиска
          </Text>
        </View>
      );
    }

    return null;
  };

  const handleClear = () => {
    setQuery('');
    setMovies([]);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content"/>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Поиск фильмов</Text>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => navigation.navigate('History')}>
          <Text style={styles.historyButtonText}>История</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск фильмов на Rezka.ag..."
            placeholderTextColor="#666"
            value={query}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Баннер "Продолжить просмотр" */}
      {lastWatch && !query.trim() && (
        <TouchableOpacity
          style={styles.continueWatchingBanner}
          onPress={handleContinueWatching}
          activeOpacity={0.8}
        >
          {lastWatch.movie.poster && (
            <Image
              source={{uri: lastWatch.movie.poster}}
              style={styles.continueWatchingPoster}
            />
          )}
          <View style={styles.continueWatchingInfo}>
            <Text style={styles.continueWatchingLabel}>Продолжить просмотр</Text>
            <Text style={styles.continueWatchingTitle} numberOfLines={1}>
              {lastWatch.movie.title}
            </Text>
            {(lastWatch.seasonTitle || lastWatch.episodeTitle) && (
              <Text style={styles.continueWatchingEpisode} numberOfLines={1}>
                {lastWatch.seasonTitle && `${lastWatch.seasonTitle}, `}
                {lastWatch.episodeTitle}
              </Text>
            )}
            {lastWatch.translationTitle && (
              <Text style={styles.continueWatchingTranslation} numberOfLines={1}>
                {lastWatch.translationTitle}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.continueWatchingClose}
            onPress={handleDismissLastWatch}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          >
            <Text style={styles.continueWatchingCloseText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <FlatList
        data={query.trim() ? movies : history}
        keyExtractor={(item) => query.trim() ? (item as Movie).id : (item as HistoryEntry).movie.id}
        renderItem={({item}) => <MovieCard movie={query.trim() ? item as Movie : (item as HistoryEntry).movie}/>}
        contentContainerStyle={
          (query.trim() ? movies.length === 0 : history.length === 0)
            ? styles.emptyList
            : styles.list
        }
        ListHeaderComponent={
          !query.trim() && history.length > 0 ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Недавно просмотренные</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={renderEmptyComponent}
      />
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
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  historyButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#333',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  historyButtonText: {
    fontSize: 14,
    color: '#5eb3ff',
    fontWeight: '600',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingRight: 40,
    fontSize: 16,
    backgroundColor: '#333',
    color: '#ffffff',
  },
  clearButton: {
    position: 'absolute',
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  list: {
    paddingVertical: 8,
  },
  emptyList: {
    flex: 1,
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
  },
  placeholderText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#5eb3ff',
  },
  continueWatchingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  continueWatchingPoster: {
    width: 50,
    height: 75,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  continueWatchingInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  continueWatchingLabel: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
    marginBottom: 4,
  },
  continueWatchingTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  continueWatchingEpisode: {
    fontSize: 13,
    color: '#aaa',
    marginTop: 2,
  },
  continueWatchingTranslation: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  continueWatchingClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueWatchingCloseText: {
    fontSize: 14,
    color: '#888',
    fontWeight: 'bold',
  },
});
