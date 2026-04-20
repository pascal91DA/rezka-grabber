import React, {useCallback, useState} from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {BlacklistItem, BlacklistService} from '../services/blacklistService';

export const BlacklistScreen: React.FC = () => {
  const [items, setItems] = useState<BlacklistItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      BlacklistService.invalidateCache();
      BlacklistService.getAll().then(setItems);
    }, []),
  );

  const handleRemove = (item: BlacklistItem) => {
    Alert.alert('Удалить из чёрного списка?', item.title, [
      {text: 'Отмена', style: 'cancel'},
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await BlacklistService.remove(item.id);
          setItems(prev => prev.filter(i => i.id !== item.id));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Чёрный список пуст</Text>
          <Text style={styles.emptyHint}>Долгое нажатие на постер → «Добавить в чёрный список»</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({item}) => (
            <View style={styles.item}>
              {item.poster ? (
                <Image source={{uri: item.poster}} style={styles.poster} resizeMode="cover" />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Text style={styles.posterIcon}>🎬</Text>
                </View>
              )}
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#1a1a1a'},
  empty: {flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32},
  emptyText: {fontSize: 16, color: '#555', marginBottom: 8},
  emptyHint: {fontSize: 13, color: '#444', textAlign: 'center', lineHeight: 18},
  list: {paddingTop: 8},
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  poster: {
    width: 44,
    height: 66,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
    marginRight: 12,
  },
  posterPlaceholder: {justifyContent: 'center', alignItems: 'center'},
  posterIcon: {fontSize: 20},
  title: {flex: 1, fontSize: 14, color: '#ddd', lineHeight: 20},
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeBtnText: {color: '#ff6b6b', fontSize: 14, fontWeight: '700'},
});
