import React, {useState} from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTimer, formatTime, TIMER_PRESETS} from '../context/TimerContext';

/**
 * Компактная кнопка-триггер с всплывающим меню для управления таймером сна.
 * Позволяет поставить/отменить таймер не уходя с текущего экрана.
 */
export const SleepTimerMenu: React.FC = () => {
  const {timeLeft, setTimer, cancelTimer} = useTimer();
  const [open, setOpen] = useState(false);

  const active = timeLeft !== null;

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, active && styles.triggerActive]}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.triggerText, active && styles.triggerTextActive]}>
          🌙 {active ? formatTime(timeLeft!) : 'Таймер сна'}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <TouchableOpacity style={styles.menu} activeOpacity={1}>
            <Text style={styles.menuTitle}>Таймер сна</Text>

            {active ? (
              <>
                <View style={styles.activeRow}>
                  <Text style={styles.activeCountdown}>{formatTime(timeLeft!)}</Text>
                  <Text style={styles.activeLabel}>до закрытия приложения</Text>
                </View>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    cancelTimer();
                    setOpen(false);
                  }}
                >
                  <Text style={styles.cancelBtnText}>Отменить таймер</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.menuHint}>
                  Приложение автоматически закроется по истечении времени.
                </Text>
                <View style={styles.presets}>
                  {TIMER_PRESETS.map(p => (
                    <TouchableOpacity
                      key={p.seconds}
                      style={styles.presetBtn}
                      onPress={() => {
                        setTimer(p.seconds);
                        setOpen(false);
                      }}
                    >
                      <Text style={styles.presetBtnText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  triggerActive: {
    backgroundColor: '#1f3a4d',
    borderColor: '#5eb3ff',
  },
  triggerText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  triggerTextActive: {color: '#5eb3ff'},
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  menu: {
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  menuTitle: {fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 12},
  menuHint: {fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 18},
  presets: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  presetBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  presetBtnText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  activeRow: {alignItems: 'center', marginBottom: 20},
  activeCountdown: {fontSize: 40, fontWeight: '700', color: '#5eb3ff', letterSpacing: 1},
  activeLabel: {fontSize: 13, color: '#666', marginTop: 4},
  cancelBtn: {
    backgroundColor: '#3a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#5a2a2a',
  },
  cancelBtnText: {color: '#ff6b6b', fontSize: 14, fontWeight: '600'},
});
