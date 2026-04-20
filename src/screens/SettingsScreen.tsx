import React from 'react';
import {StatusBar, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../types/navigation';
import {useTimer, formatTime} from '../context/TimerContext';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const TIMER_PRESETS = [
  {label: '5 мин', seconds: 5 * 60},
  {label: '30 мин', seconds: 30 * 60},
  {label: '1 ч', seconds: 60 * 60},
  {label: '1.5 ч', seconds: 90 * 60},
  {label: '2 ч', seconds: 120 * 60},
];

const NAV_ROWS = [
  {label: 'Чёрный список', hint: 'Скрытые из новинок и поиска фильмы и сериалы', screen: 'Blacklist'},
  {label: 'Просмотрено', hint: 'Фильмы и сериалы, отмеченные как просмотренные', screen: 'Watched'},
] as const;

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const {timeLeft, setTimer, cancelTimer} = useTimer();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Настройки</Text>
      </View>

      {/* Таймер сна */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Таймер сна</Text>
        {timeLeft !== null ? (
          <View style={styles.timerActive}>
            <Text style={styles.timerCountdown}>{formatTime(timeLeft)}</Text>
            <Text style={styles.timerLabel}>до закрытия приложения</Text>
            <TouchableOpacity style={styles.cancelTimerBtn} onPress={cancelTimer}>
              <Text style={styles.cancelTimerBtnText}>Отменить таймер</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionHint}>
              Приложение автоматически закроется по истечении времени.
            </Text>
            <View style={styles.presets}>
              {TIMER_PRESETS.map(p => (
                <TouchableOpacity
                  key={p.seconds}
                  style={styles.presetBtn}
                  onPress={() => setTimer(p.seconds)}
                >
                  <Text style={styles.presetBtnText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Навигационные пункты */}
      <View style={styles.navList}>
        {NAV_ROWS.map(row => (
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
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionHint: {fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 18},
  presets: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  presetBtn: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  presetBtnText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  timerActive: {alignItems: 'center', paddingVertical: 8},
  timerCountdown: {fontSize: 40, fontWeight: '700', color: '#5eb3ff', letterSpacing: 1},
  timerLabel: {fontSize: 13, color: '#666', marginTop: 4, marginBottom: 16},
  cancelTimerBtn: {
    backgroundColor: '#3a1a1a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#5a2a2a',
  },
  cancelTimerBtnText: {color: '#ff6b6b', fontSize: 14, fontWeight: '600'},
  navList: {marginTop: 8},
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
