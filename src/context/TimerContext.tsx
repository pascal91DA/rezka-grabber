import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BackHandler, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from './ThemeContext';

interface TimerContextValue {
  timeLeft: number | null;
  setTimer: (seconds: number) => void;
  cancelTimer: () => void;
}

const TimerContext = createContext<TimerContextValue>({
  timeLeft: null,
  setTimer: () => {},
  cancelTimer: () => {},
});

export const TIMER_PRESETS = [
  { label: '5 мин', seconds: 5 * 60 },
  { label: '30 мин', seconds: 30 * 60 },
  { label: '1 ч', seconds: 60 * 60 },
  { label: '1.5 ч', seconds: 90 * 60 },
  { label: '2 ч', seconds: 120 * 60 },
];

export function useTimer() {
  return useContext(TimerContext);
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);

  // Предупреждение выводится на последней минуте, пока его не закрыли вручную.
  const showWarning = timeLeft !== null && timeLeft > 0 && timeLeft <= 60 && !warningDismissed;

  const cancelTimer = useCallback(() => {
    setTimeLeft(null);
    setWarningDismissed(false);
  }, []);

  const setTimer = useCallback((seconds: number) => {
    setWarningDismissed(false);
    setTimeLeft(seconds);
  }, []);

  useEffect(() => {
    if (timeLeft === null) return;

    if (timeLeft <= 0) {
      BackHandler.exitApp();
      return;
    }

    const tick = setTimeout(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(tick);
  }, [timeLeft]);

  const handleWarningCancel = () => {
    cancelTimer();
  };

  const handleWarningContinue = () => {
    setWarningDismissed(true);
  };

  return (
    <TimerContext.Provider value={{ timeLeft, setTimer, cancelTimer }}>
      {children}

      <Modal visible={showWarning} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Таймер сна</Text>
            <Text style={styles.dialogBody}>
              Приложение закроется через <Text style={styles.dialogCountdown}>{timeLeft ?? 0}</Text>{' '}
              сек.
            </Text>
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.accentStrong }]}
                onPress={handleWarningCancel}
              >
                <Text style={[styles.cancelBtnText, { color: theme.onAccent }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.okBtn} onPress={handleWarningContinue}>
                <Text style={styles.okBtnText}>Понятно</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </TimerContext.Provider>
  );
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export { formatTime };

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  dialog: {
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  dialogBody: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
    marginBottom: 24,
  },
  dialogCountdown: {
    color: '#ff6b6b',
    fontWeight: '700',
    fontSize: 17,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  okBtn: {
    flex: 1,
    backgroundColor: '#3a3a3a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  okBtnText: {
    color: '#aaa',
    fontSize: 15,
  },
});
