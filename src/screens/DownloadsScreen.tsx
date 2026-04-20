import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {DownloadService, DownloadedItem} from '../services/downloadService';

export const DownloadsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<DownloadedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    const list = await DownloadService.listDownloads();
    setItems(list);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.title.toLowerCase().includes(q));
  }, [items, query]);

  const handlePlay = (item: DownloadedItem) => {
    navigation.navigate('OfflinePlayer', {
      title: item.title,
      localM3u8Uri: item.localM3u8Uri,
      subtitleUri: item.subtitleUri,
    });
  };

  const handleDelete = (item: DownloadedItem) => {
    Alert.alert('Удалить', `Удалить "${item.title}"?`, [
      {text: 'Отмена', style: 'cancel'},
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await DownloadService.deleteDownload(item.localM3u8Uri);
          setItems(prev => prev.filter(i => i.localM3u8Uri !== item.localM3u8Uri));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.centered, {paddingTop: insets.top}]}>
        <ActivityIndicator size="large" color="#5eb3ff" />
      </View>
    );
  }

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      {/* Поиск */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск по загрузкам..."
          placeholderTextColor="#555"
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Ionicons name="close-circle" size={16} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="download-outline" size={64} color="#444" />
          <Text style={styles.emptyTitle}>Нет загрузок</Text>
          <Text style={styles.emptySubtitle}>
            Скачанные видео появятся здесь.{'\n'}
            Нажмите «⬇ Скачать» в плеере.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={48} color="#444" />
          <Text style={styles.emptyTitle}>Ничего не найдено</Text>
          <Text style={styles.emptySubtitle}>Попробуйте другой запрос</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={filtered}
          keyExtractor={item => item.localM3u8Uri}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({item}) => (
            <TouchableOpacity style={styles.item} onPress={() => handlePlay(item)}>
              <View style={styles.itemIcon}>
                <Ionicons name="film-outline" size={28} color="#5eb3ff" />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                <View style={styles.itemMeta}>
                  {item.subtitleUri && (
                    <View style={styles.subtitleBadge}>
                      <Text style={styles.subtitleBadgeText}>SUB</Text>
                    </View>
                  )}
                  <Text style={styles.itemMetaText}>
                    {item.segmentCount > 0 ? `${item.segmentCount} сегм.` : 'HLS'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(item)}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              >
                <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    margin: 12,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    padding: 0,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  separator: {
    height: 1,
    backgroundColor: '#2a2a2a',
    marginVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 20,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitleBadge: {
    backgroundColor: '#2a6a9e',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  subtitleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  itemMetaText: {
    fontSize: 12,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
});
