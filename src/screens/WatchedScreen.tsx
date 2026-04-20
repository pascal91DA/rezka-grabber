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
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {WatchedItem, WatchedService} from '../services/watchedService';
import {RootStackParamList} from '../types/navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const WatchedScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const [items, setItems] = useState<WatchedItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      WatchedService.invalidateCache();
      WatchedService.getAll().then(setItems);
    }, []),
  );

  const handleRemove = (item: WatchedItem) => {
    Alert.alert('Удалить из просмотренного?', item.title, [
      {text: 'Отмена', style: 'cancel'},
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await WatchedService.remove(item.id);
          setItems(prev => prev.filter(i => i.id !== item.id));
        },
      },
    ]);
  };

  const handleOpen = (item: WatchedItem) => {
    navigation.navigate('Player', {
      movie: {id: item.id, title: item.title, url: item.url, poster: item.poster},
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Список просмотренного пуст</Text>
          <Text style={styles.emptyHint}>Долгое нажатие на постер → «Отметить как просмотренное»</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({item}) => (
            <TouchableOpacity style={styles.item} onPress={() => handleOpen(item)} activeOpacity={0.7}>
              {item.poster ? (
                <Image source={{uri: item.poster}} style={styles.poster} resizeMode="cover" />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Text style={styles.posterIcon}>🎬</Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.date}>
                  {new Date(item.watchedAt).toLocaleDateString('ru-RU')}
                </Text>
              </View>
              <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
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
  info: {flex: 1},
  title: {fontSize: 14, color: '#ddd', lineHeight: 20},
  date: {fontSize: 12, color: '#666', marginTop: 4},
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a2a3a',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeBtnText: {color: '#5eb3ff', fontSize: 14, fontWeight: '700'},
});
