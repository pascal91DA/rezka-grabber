import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {Alert, BackHandler, Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

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

export function useTimer() {
  return useContext(TimerContext);
}

export function TimerProvider({children}: {children: React.ReactNode}) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const warningShownAt = useRef<number | null>(null);

  const cancelTimer = useCallback(() => {
    setTimeLeft(null);
    setShowWarning(false);
    warningShownAt.current = null;
  }, []);

  const setTimer = useCallback((seconds: number) => {
    warningShownAt.current = null;
    setShowWarning(false);
    setTimeLeft(seconds);
  }, []);

  useEffect(() => {
    if (timeLeft === null) return;

    if (timeLeft <= 0) {
      setShowWarning(false);
      BackHandler.exitApp();
      return;
    }

    if (timeLeft <= 60 && warningShownAt.current === null) {
      warningShownAt.current = timeLeft;
      setShowWarning(true);
    }

    const tick = setTimeout(() => {
      setTimeLeft(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(tick);
  }, [timeLeft]);

  const handleWarningCancel = () => {
    cancelTimer();
  };

  const handleWarningContinue = () => {
    setShowWarning(false);
  };

  return (
    <TimerContext.Provider value={{timeLeft, setTimer, cancelTimer}}>
      {children}

      <Modal
        visible={showWarning}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Таймер сна</Text>
            <Text style={styles.dialogBody}>
              Приложение закроется через{' '}
              <Text style={styles.dialogCountdown}>{timeLeft ?? 0}</Text> сек.
            </Text>
            <View style={styles.dialogButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleWarningCancel}>
                <Text style={styles.cancelBtnText}>Отмена</Text>
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

export {formatTime};

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
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#fff',
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
