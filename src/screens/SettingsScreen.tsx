import React from 'react';
import {StatusBar, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../types/navigation';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface SettingsRow {
  label: string;
  hint: string;
  screen: keyof RootStackParamList;
}

const ROWS: SettingsRow[] = [
  {
    label: 'Чёрный список',
    hint: 'Скрытые из новинок и поиска фильмы и сериалы',
    screen: 'Blacklist',
  },
  {
    label: 'Просмотрено',
    hint: 'Фильмы и сериалы, отмеченные как просмотренные',
    screen: 'Watched',
  },
];

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Настройки</Text>
      </View>
      <View style={styles.list}>
        {ROWS.map(row => (
          <TouchableOpacity
            key={row.screen}
            style={styles.row}
            onPress={() => navigation.navigate(row.screen as any)}
            activeOpacity={0.7}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowHint}>{row.hint}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#1a1a1a'},
  header: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  headerTitle: {fontSize: 24, fontWeight: 'bold', color: '#fff'},
  list: {marginTop: 8},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  rowText: {flex: 1},
  rowLabel: {fontSize: 15, color: '#fff', fontWeight: '500'},
  rowHint: {fontSize: 12, color: '#666', marginTop: 2},
  chevron: {fontSize: 22, color: '#555', marginLeft: 8},
});
