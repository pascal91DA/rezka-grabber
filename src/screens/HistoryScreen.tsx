import React, {useState, useCallback, useMemo} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {HistoryService, HistoryEntry} from '../services/historyService';
import {RootStackParamList} from '../types/navigation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export const HistoryScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const tabBarHeight = useBottomTabBarHeight();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const movies = await HistoryService.getHistory();
      setHistory(movies);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      e =>
        e.movie.title.toLowerCase().includes(q) ||
        (e.movie.originalTitle && e.movie.originalTitle.toLowerCase().includes(q)),
    );
  }, [history, query]);

  const handleMoviePress = (entry: HistoryEntry) => {
    navigation.navigate('Player', {
      movie: entry.movie,
      resume: {
        translationId: entry.translationId,
        seasonId: entry.seasonId,
        episodeId: entry.episodeId,
      },
    });
  };

  const handleRemove = async (entry: HistoryEntry) => {
    const key = HistoryService.entryKey(entry);
    await HistoryService.removeFromHistory(key);
    setHistory(prev => prev.filter(e => HistoryService.entryKey(e) !== key));
  };

  const handleClearAll = () => {
    Alert.alert(
      'Очистить историю',
      'Удалить всю историю просмотров?',
      [
        {text: 'Отмена', style: 'cancel'},
        {
          text: 'Очистить',
          style: 'destructive',
          onPress: async () => {
            await HistoryService.clearHistory();
            setHistory([]);
            setQuery('');
          },
        },
      ],
    );
  };

  const renderItem = ({item}: {item: HistoryEntry}) => {
    const details: string[] = [];
    if (item.translationTitle) details.push(item.translationTitle);
    if (item.seasonTitle) details.push(item.seasonTitle);
    if (item.episodeTitle) details.push(item.episodeTitle);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleMoviePress(item)}
        activeOpacity={0.7}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.movie.title}
          </Text>
          {item.movie.originalTitle && (
            <Text style={styles.cardOriginalTitle} numberOfLines={1}>
              {item.movie.originalTitle}
            </Text>
          )}
          <View style={styles.cardMeta}>
            {item.movie.year && (
              <Text style={styles.cardYear}>{item.movie.year}</Text>
            )}
            {item.movie.rating && (
              <Text style={styles.cardRating}>★ {item.movie.rating}</Text>
            )}
          </View>
          {details.length > 0 && (
            <Text style={styles.cardDetails} numberOfLines={1}>
              {details.join(' · ')}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemove(item)}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Text style={styles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>История просмотров</Text>
        {history.length > 0 ? (
          <TouchableOpacity
            style={styles.clearAllButton}
            onPress={handleClearAll}>
            <Text style={styles.clearAllButtonText}>Очистить</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.clearAllButton} />
        )}
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по истории..."
            placeholderTextColor="#666"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setQuery('')}>
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#5eb3ff" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => HistoryService.entryKey(item)}
          renderItem={renderItem}
          contentContainerStyle={[
            filtered.length === 0 ? styles.emptyList : styles.list,
            {paddingBottom: tabBarHeight},
          ]}

          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              {query.trim() ? (
                <Text style={styles.emptyText}>Ничего не найдено</Text>
              ) : (
                <>
                  <Text style={styles.emptyText}>История просмотров пуста</Text>
                  <Text style={styles.emptySubText}>
                    Здесь появятся фильмы, которые вы смотрели
                  </Text>
                </>
              )}
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  clearAllButton: {
    alignItems: 'flex-end',
  },
  clearAllButtonText: {
    fontSize: 15,
    color: '#ff6b6b',
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingRight: 40,
    fontSize: 15,
    backgroundColor: '#333',
    color: '#ffffff',
  },
  clearButton: {
    position: 'absolute',
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 13,
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
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#888',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  cardInfo: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 3,
  },
  cardOriginalTitle: {
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardYear: {
    fontSize: 12,
    color: '#888',
    marginRight: 8,
  },
  cardRating: {
    fontSize: 12,
    color: '#ffa500',
    fontWeight: '600',
  },
  cardDetails: {
    fontSize: 12,
    color: '#5eb3ff',
    marginTop: 5,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3a3a3a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 13,
    color: '#888',
    fontWeight: 'bold',
  },
});
