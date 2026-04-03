import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions} from 'react-native';
import Video, {OnProgressData, VideoRef, ViewType} from 'react-native-video';
import * as FileSystem from 'expo-file-system/legacy';
import * as NavigationBar from 'expo-navigation-bar';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {parseVtt, getCurrentCue} from '../utils/vttParser';

interface OfflinePlayerScreenProps {
  route: {
    params: {
      title: string;
      localM3u8Uri: string;
      subtitleUri?: string;
    };
  };
}

export const OfflinePlayerScreen: React.FC<OfflinePlayerScreenProps> = ({route}) => {
  const {title, localM3u8Uri, subtitleUri} = route.params;
  const navigation = useNavigation();
  const {width, height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [subtitleText, setSubtitleText] = useState<string | null>(null);

  const videoRef = useRef<VideoRef>(null);
  const vttCuesRef = useRef<ReturnType<typeof parseVtt>>([]);
  const interceptingFullscreen = useRef(false);

  // Загружаем субтитры если есть
  useEffect(() => {
    if (!subtitleUri) return;
    FileSystem.readAsStringAsync(subtitleUri)
      .then(text => {
        vttCuesRef.current = parseVtt(text);
      })
      .catch(e => console.warn('[OfflinePlayer] Subtitle load failed:', e));
  }, [subtitleUri]);

  // Скрываем/показываем header при fullscreen
  useEffect(() => {
    navigation.setOptions({headerShown: !isFullscreen});
  }, [isFullscreen, navigation]);

  const handleProgress = useCallback((data: OnProgressData) => {
    if (vttCuesRef.current.length > 0) {
      setSubtitleText(getCurrentCue(vttCuesRef.current, data.currentTime));
    }
  }, []);

  const handleFullscreenPresent = useCallback(() => {
    interceptingFullscreen.current = true;
    videoRef.current?.dismissFullscreenPlayer();
    setIsFullscreen(prev => {
      const entering = !prev;
      StatusBar.setHidden(entering, 'fade');
      NavigationBar.setVisibilityAsync(entering ? 'hidden' : 'visible');
      return entering;
    });
  }, []);

  const handleFullscreenDismiss = useCallback(() => {
    if (interceptingFullscreen.current) {
      interceptingFullscreen.current = false;
      return;
    }
    setIsFullscreen(false);
    StatusBar.setHidden(false, 'fade');
    NavigationBar.setVisibilityAsync('visible');
  }, []);

  useEffect(() => {
    return () => {
      StatusBar.setHidden(false);
      NavigationBar.setVisibilityAsync('visible');
    };
  }, []);

  const videoStyle = isFullscreen
    ? styles.videoFullscreen
    : isLandscape
    ? styles.videoLandscape
    : styles.video;

  const wrapperStyle = isFullscreen
    ? styles.wrapperFullscreen
    : isLandscape
    ? styles.wrapperLandscape
    : styles.wrapper;

  return (
    <View
      style={[
        styles.root,
        isLandscape && !isFullscreen && styles.rootLandscape,
        !isFullscreen && {paddingBottom: insets.bottom},
      ]}
    >
      <View style={wrapperStyle}>
        <Video
          ref={videoRef}
          source={{uri: localM3u8Uri}}
          style={videoStyle}
          controls
          resizeMode="contain"
          viewType={ViewType.TEXTURE}
          onProgress={handleProgress}
          onFullscreenPlayerWillPresent={handleFullscreenPresent}
          onFullscreenPlayerWillDismiss={handleFullscreenDismiss}
        />
        {subtitleText ? (
          <View style={styles.subtitleOverlay} pointerEvents="none">
            <Text style={styles.subtitleText}>{subtitleText}</Text>
          </View>
        ) : null}
      </View>

      {!isFullscreen && (
        <View style={styles.info}>
          <Text style={styles.infoTitle} numberOfLines={3}>
            {title}
          </Text>
          <Text style={styles.infoHint}>
            {subtitleUri ? 'Субтитры загружены' : 'Без субтитров'} · Offline
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  rootLandscape: {
    flexDirection: 'row',
  },
  wrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  wrapperLandscape: {
    width: '40%',
    backgroundColor: '#000',
  },
  wrapperFullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoLandscape: {
    width: '100%',
    height: '100%',
  },
  videoFullscreen: {
    width: '100%',
    height: '100%',
  },
  subtitleOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 8,
    right: 8,
    alignItems: 'center',
    zIndex: 999,
    elevation: 999,
  },
  subtitleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    overflow: 'hidden',
  },
  info: {
    padding: 20,
    gap: 6,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoHint: {
    fontSize: 13,
    color: '#666',
  },
});
