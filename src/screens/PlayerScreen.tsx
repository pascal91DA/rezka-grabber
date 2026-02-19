import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View} from 'react-native';
import Video, {OnProgressData, VideoRef} from 'react-native-video';
import {Movie} from '../types/Movie';
import {ResumeParams} from '../types/navigation';
import {Episode, MovieData, RezkaService, Season, Translation} from '../services/rezkaService';
import {HistoryService} from '../services/historyService';
import {activateKeepAwakeAsync, deactivateKeepAwake} from "expo-keep-awake";

interface PlayerScreenProps {
  route: {
    params: {
      movie: Movie;
      resume?: ResumeParams;
    };
  };
}

export const PlayerScreen: React.FC<PlayerScreenProps> = ({route}) => {
  const {movie, resume} = route.params;
  const [loading, setLoading] = useState(true);
  const [movieData, setMovieData] = useState<MovieData | null>(null);
  const [selectedTranslation, setSelectedTranslation] = useState<Translation | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoQuality, setVideoQuality] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [autoPlay, setAutoPlay] = useState(true);
  const [paused, setPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Ref для видеоплеера
  const videoRef = useRef<VideoRef>(null);
  // Флаг что был в fullscreen перед переключением серии
  const wasInFullscreen = useRef(false);
  // Ref для отслеживания, что мы уже обрабатываем переход к следующей серии
  const isLoadingNextEpisode = useRef(false);
  // Ref для отслеживания, что идёт первоначальная загрузка с resume
  const isRestoringFromResume = useRef(false);
  // Предзагруженный URL следующей серии
  const preloadedNextEpisode = useRef<{
    episode: Episode;
    season?: Season;
    url: string;
    quality: string;
  } | null>(null);
  // Счётчик retry при ошибке воспроизведения
  const retryCount = useRef(0);
  const maxRetries = 3;
  // Флаг что видео загружено
  const videoLoaded = useRef(false);
  // Флаг что переключаем серию
  const switchingEpisode = useRef(false);
  // Длительность видео
  const videoDuration = useRef(0);

  useEffect(() => {
    activateKeepAwakeAsync().then(r => console.log("activateKeepAwakeAsync", r));

    return () => {
      deactivateKeepAwake().then(r => console.log("deactivateKeepAwake", r));
    };
  }, []);

  useEffect(() => {
    loadMovieData();
  }, []);

  // Фильтруем серии по выбранному сезону
  const filteredEpisodes = movieData?.episodes?.filter(
    (episode) => !selectedSeason || episode.seasonId === selectedSeason.id
  ) || [];

  // Получаем следующую серию
  const getNextEpisode = useCallback((): { episode: Episode; season?: Season } | null => {
    if (!movieData?.episodes || !selectedEpisode) return null;

    const allEpisodes = movieData.episodes;
    const currentIndex = allEpisodes.findIndex(
      (ep) => ep.id === selectedEpisode.id && ep.seasonId === selectedEpisode.seasonId
    );

    if (currentIndex === -1 || currentIndex >= allEpisodes.length - 1) {
      return null;
    }

    const nextEpisode = allEpisodes[currentIndex + 1];

    if (nextEpisode.seasonId !== selectedEpisode.seasonId && movieData.seasons) {
      const nextSeason = movieData.seasons.find((s) => s.id === nextEpisode.seasonId);
      return {episode: nextEpisode, season: nextSeason};
    }

    return {episode: nextEpisode};
  }, [movieData, selectedEpisode]);

  // Предзагрузка URL следующей серии
  const preloadNextEpisode = useCallback(async () => {
    const next = getNextEpisode();
    if (!next) {
      preloadedNextEpisode.current = null;
      return;
    }

    if (preloadedNextEpisode.current?.episode.id === next.episode.id &&
      preloadedNextEpisode.current?.episode.seasonId === next.episode.seasonId) {
      return;
    }

    console.log('[Preload] Starting preload for:', next.episode.title);

    try {
      const result = await RezkaService.getVideoUrlWithRetry(
        movie.url,
        selectedTranslation?.id || '',
        selectedTranslation?.slug,
        next.season?.id || selectedSeason?.id,
        next.episode.id,
        3
      );

      preloadedNextEpisode.current = {
        episode: next.episode,
        season: next.season,
        url: result.url,
        quality: result.quality,
      };

      console.log('[Preload] Preloaded successfully:', next.episode.title);
    } catch (err) {
      console.error('[Preload] Failed:', err);
      preloadedNextEpisode.current = null;
    }
  }, [getNextEpisode, movie.url, selectedTranslation?.id, selectedSeason?.id]);

  // Переключение на следующую серию
  const playNextEpisode = useCallback(async () => {
    if (isLoadingNextEpisode.current || loadingVideo || switchingEpisode.current) return;

    const next = getNextEpisode();
    if (!next) return;

    switchingEpisode.current = true;
    isLoadingNextEpisode.current = true;

    console.log('[playNextEpisode] isFullscreen:', isFullscreen);

    // Выходим из fullscreen
    if (isFullscreen && videoRef.current) {
      wasInFullscreen.current = true;
      console.log('[playNextEpisode] Dismissing fullscreen');
      videoRef.current.dismissFullscreenPlayer();
    }

    // Задержка для выхода из fullscreen
    await new Promise(resolve => setTimeout(resolve, 300));

    const preloaded = preloadedNextEpisode.current;
    const hasPreloaded = preloaded &&
      preloaded.episode.id === next.episode.id &&
      preloaded.episode.seasonId === next.episode.seasonId;

    if (hasPreloaded) {
      console.log('[playNextEpisode] Using preloaded URL');

      if (next.season) setSelectedSeason(next.season);
      setSelectedEpisode(next.episode);
      setVideoUrl(preloaded.url);
      setVideoQuality(preloaded.quality);
      videoLoaded.current = false;

      HistoryService.saveLastWatch({
        movie,
        translationId: selectedTranslation?.id,
        translationTitle: selectedTranslation?.title,
        seasonId: next.season?.id || selectedSeason?.id,
        seasonTitle: next.season?.title || selectedSeason?.title,
        episodeId: next.episode.id,
        episodeTitle: next.episode.title,
      });

      preloadedNextEpisode.current = null;
    } else {
      console.log('[playNextEpisode] Loading URL...');

      if (next.season) setSelectedSeason(next.season);
      setSelectedEpisode(next.episode);
      setLoadingVideo(true);
      setError(null);
      setLoadingStatus('Загрузка следующей серии...');

      try {
        const result = await RezkaService.getVideoUrlWithRetry(
          movie.url,
          selectedTranslation?.id || '',
          selectedTranslation?.slug,
          next.season?.id || selectedSeason?.id,
          next.episode.id,
          5,
          (attempt, maxAttempts, quality) => {
            setLoadingStatus(`Попытка ${attempt}/${maxAttempts}... ${quality ? `(${quality})` : ''}`);
          }
        );

        setVideoUrl(result.url);
        setVideoQuality(result.quality);
        videoLoaded.current = false;
        setLoadingStatus('');

        HistoryService.saveLastWatch({
          movie,
          translationId: selectedTranslation?.id,
          translationTitle: selectedTranslation?.title,
          seasonId: next.season?.id || selectedSeason?.id,
          seasonTitle: next.season?.title || selectedSeason?.title,
          episodeId: next.episode.id,
          episodeTitle: next.episode.title,
        });
      } catch (err) {
        setError('Не удалось загрузить следующую серию');
        setLoadingStatus('');
      } finally {
        setLoadingVideo(false);
      }
    }

    setTimeout(() => {
      isLoadingNextEpisode.current = false;
      switchingEpisode.current = false;
    }, 500);
  }, [getNextEpisode, loadingVideo, movie, selectedTranslation, selectedSeason, isFullscreen]);

  // Обработчик загрузки видео
  const handleLoad = useCallback((data: { duration: number }) => {
    console.log('[Player] Video loaded, duration:', data.duration);
    videoDuration.current = data.duration;
    videoLoaded.current = true;
    retryCount.current = 0;
    preloadNextEpisode();

    // Восстанавливаем fullscreen если был
    if (wasInFullscreen.current && videoRef.current) {
      console.log('[Player] Restoring fullscreen');
      setTimeout(() => {
        videoRef.current?.presentFullscreenPlayer();
        wasInFullscreen.current = false;
      }, 500);
    }
  }, [preloadNextEpisode]);

  // Обработчик прогресса
  const handleProgress = useCallback((data: OnProgressData) => {
    const remaining = videoDuration.current - data.currentTime;

    // Когда до конца меньше 1 секунды
    if (videoDuration.current > 0 && remaining < 1 && remaining >= 0 && !switchingEpisode.current) {
      if (autoPlay && movieData?.episodes && movieData.episodes.length > 0) {
        console.log('[Player] Near end, switching to next episode');
        playNextEpisode();
      }
    }
  }, [autoPlay, movieData?.episodes, playNextEpisode]);

  // Обработчик окончания видео
  const handleEnd = useCallback(() => {
    console.log('[Player] Video ended');
    if (autoPlay && movieData?.episodes && movieData.episodes.length > 0 && !switchingEpisode.current) {
      playNextEpisode();
    }
  }, [autoPlay, movieData?.episodes, playNextEpisode]);

  // Обработчик ошибки
  const handleError = useCallback((error: any) => {
    console.error('[Player] Error:', error);

    if (retryCount.current < maxRetries) {
      retryCount.current++;
      console.log(`[Player] Retrying ${retryCount.current}/${maxRetries}...`);

      RezkaService.getVideoUrlWithRetry(
        movie.url,
        selectedTranslation?.id || '',
        selectedTranslation?.slug,
        selectedSeason?.id,
        selectedEpisode?.id,
        3
      ).then((result) => {
        setVideoUrl(result.url);
        setVideoQuality(result.quality);
      }).catch(() => {
        setError('Ошибка воспроизведения');
      });
    } else {
      setError('Ошибка воспроизведения видео');
    }
  }, [movie.url, selectedTranslation?.id, selectedSeason?.id, selectedEpisode?.id]);

  // Обновляем выбранную серию при смене сезона
  useEffect(() => {
    if (isRestoringFromResume.current) return;

    if (selectedSeason && filteredEpisodes.length > 0) {
      const currentEpisodeInSeason = filteredEpisodes.find(
        (ep) => ep.id === selectedEpisode?.id && ep.seasonId === selectedEpisode?.seasonId
      );

      if (!currentEpisodeInSeason) {
        setSelectedEpisode(filteredEpisodes[0]);
      }
    }
  }, [selectedSeason]);

  // Сбрасываем URL при изменении выбора
  const prevTranslation = useRef(selectedTranslation?.id);
  const prevSeason = useRef(selectedSeason?.id);
  const prevEpisode = useRef(selectedEpisode?.id);

  useEffect(() => {
    if (isLoadingNextEpisode.current) {
      prevEpisode.current = selectedEpisode?.id;
      return;
    }

    const translationChanged = prevTranslation.current !== selectedTranslation?.id;
    const seasonChanged = prevSeason.current !== selectedSeason?.id;
    const episodeChanged = prevEpisode.current !== selectedEpisode?.id;

    prevTranslation.current = selectedTranslation?.id;
    prevSeason.current = selectedSeason?.id;
    prevEpisode.current = selectedEpisode?.id;

    if (selectedTranslation && (translationChanged || seasonChanged || episodeChanged)) {
      setVideoUrl(null);
      preloadedNextEpisode.current = null;
      videoLoaded.current = false;
    }
  }, [selectedTranslation, selectedSeason, selectedEpisode]);

  const loadMovieData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await RezkaService.getMovieData(movie.url);
      setMovieData(data);

      if (resume) {
        isRestoringFromResume.current = true;

        if (resume.translationId && data.translations.length > 0) {
          const translation = data.translations.find(t => t.id === resume.translationId);
          setSelectedTranslation(translation || data.translations[0]);
        } else if (data.translations.length > 0) {
          setSelectedTranslation(data.translations[0]);
        }

        if (resume.seasonId && data.seasons && data.seasons.length > 0) {
          const season = data.seasons.find(s => s.id === resume.seasonId);
          setSelectedSeason(season || data.seasons[0]);
        } else if (data.seasons && data.seasons.length > 0) {
          setSelectedSeason(data.seasons[0]);
        }

        if (data.episodes && data.episodes.length > 0) {
          if (resume.episodeId) {
            const episode = data.episodes.find(
              e => e.id === resume.episodeId && e.seasonId === resume.seasonId
            );
            setSelectedEpisode(episode || data.episodes[0]);
          } else {
            setSelectedEpisode(data.episodes[0]);
          }
        }

        setTimeout(() => {
          isRestoringFromResume.current = false;
        }, 0);
      } else {
        if (data.translations.length > 0) {
          setSelectedTranslation(data.translations[0]);
        }

        if (data.seasons && data.seasons.length > 0) {
          setSelectedSeason(data.seasons[0]);
        }

        if (data.episodes && data.episodes.length > 0) {
          setSelectedEpisode(data.episodes[0]);
        }
      }
    } catch (err) {
      setError('Ошибка при загрузке данных фильма');
    } finally {
      setLoading(false);
    }
  };

  const loadVideoUrl = async () => {
    if (movieData?.translations && movieData.translations.length > 0 && !selectedTranslation) {
      setError('Выберите перевод');
      return;
    }

    try {
      setLoadingVideo(true);
      setError(null);
      setVideoUrl(null);
      setVideoQuality(null);
      setLoadingStatus('Запуск загрузки...');

      const result = await RezkaService.getVideoUrlWithRetry(
        movie.url,
        selectedTranslation?.id || '',
        selectedTranslation?.slug,
        selectedSeason?.id,
        selectedEpisode?.id,
        5,
        (attempt, maxAttempts, quality) => {
          setLoadingStatus(`Попытка ${attempt}/${maxAttempts}... ${quality ? `(${quality})` : ''}`);
        }
      );

      setVideoUrl(result.url);
      setVideoQuality(result.quality);
      setPaused(false);
      setLoadingStatus('');

      HistoryService.saveLastWatch({
        movie,
        translationId: selectedTranslation?.id,
        translationTitle: selectedTranslation?.title,
        seasonId: selectedSeason?.id,
        seasonTitle: selectedSeason?.title,
        episodeId: selectedEpisode?.id,
        episodeTitle: selectedEpisode?.title,
      });
    } catch (err) {
      let errorMessage = 'Ошибка при получении ссылки на видео';
      if (err instanceof Error) {
        errorMessage = `${errorMessage}\n\nДетали: ${err.message}`;
      }

      errorMessage += '\n\nПараметры запроса:';
      if (selectedTranslation) errorMessage += `\n• Озвучка: ${selectedTranslation.title}`;
      if (selectedSeason) errorMessage += `\n• Сезон: ${selectedSeason.title}`;
      if (selectedEpisode) errorMessage += `\n• Серия: ${selectedEpisode.title}`;

      setError(errorMessage);
      setLoadingStatus('');
    } finally {
      setLoadingVideo(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#5eb3ff"/>
        <Text style={styles.loadingText}>Загрузка...</Text>
      </View>
    );
  }

  if (!movieData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Нет данных о фильме</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollContainer}>
      <View style={styles.content}>
        {/* Блок с ошибкой */}
        {error && (
          <View style={styles.errorBanner}>
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Ошибка</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity
                style={styles.errorCloseButton}
                onPress={() => setError(null)}
              >
                <Text style={styles.errorCloseButtonText}>
                  Закрыть и попробовать другую серию
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Видеоплеер */}
        {videoUrl ? (
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{uri: videoUrl}}
              style={styles.video}
              controls={true}
              resizeMode="contain"
              paused={paused}
              onLoad={handleLoad}
              onProgress={handleProgress}
              onEnd={handleEnd}
              onError={handleError}
              onFullscreenPlayerWillPresent={() => setIsFullscreen(true)}
              onFullscreenPlayerWillDismiss={() => setIsFullscreen(false)}
            />
            {videoQuality && (
              <View style={styles.qualityBadge}>
                <Text style={styles.qualityBadgeText}>{videoQuality}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.videoPlaceholder}>
            {loadingVideo ? (
              <>
                <ActivityIndicator size="large" color="#5eb3ff"/>
                <Text style={styles.videoPlaceholderText}>
                  {loadingStatus || 'Загрузка...'}
                </Text>
              </>
            ) : (
              <Text style={styles.videoPlaceholderText}>
                Выберите озвучку{movieData.seasons ? ', сезон и серию' : ''}
                {'\n'}и нажмите "Загрузить видео"
              </Text>
            )}
          </View>
        )}

        <Text style={styles.title}>{movie.title}</Text>

        {/* Селектор переводов */}
        {movieData.translations.length > 0 && (
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Перевод:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {movieData.translations.map((translation) => (
                <TouchableOpacity
                  key={translation.id}
                  style={[
                    styles.selectorButton,
                    selectedTranslation?.id === translation.id && styles.selectorButtonActive,
                  ]}
                  onPress={() => setSelectedTranslation(translation)}
                >
                  <Text
                    style={[
                      styles.selectorButtonText,
                      selectedTranslation?.id === translation.id && styles.selectorButtonTextActive,
                    ]}
                  >
                    {translation.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Селектор сезонов */}
        {movieData.seasons && movieData.seasons.length > 0 && (
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Сезон:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {movieData.seasons.map((season) => (
                <TouchableOpacity
                  key={season.id}
                  style={[
                    styles.selectorButton,
                    selectedSeason?.id === season.id && styles.selectorButtonActive,
                  ]}
                  onPress={() => setSelectedSeason(season)}
                >
                  <Text
                    style={[
                      styles.selectorButtonText,
                      selectedSeason?.id === season.id && styles.selectorButtonTextActive,
                    ]}
                  >
                    {season.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Селектор серий */}
        {filteredEpisodes.length > 0 && (
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Серия:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {filteredEpisodes.map((episode) => (
                <TouchableOpacity
                  key={`${episode.seasonId}-${episode.id}`}
                  style={[
                    styles.selectorButton,
                    selectedEpisode?.id === episode.id &&
                    selectedEpisode?.seasonId === episode.seasonId &&
                    styles.selectorButtonActive,
                  ]}
                  onPress={() => setSelectedEpisode(episode)}
                >
                  <Text
                    style={[
                      styles.selectorButtonText,
                      selectedEpisode?.id === episode.id &&
                      selectedEpisode?.seasonId === episode.seasonId &&
                      styles.selectorButtonTextActive,
                    ]}
                  >
                    {episode.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Информация о выборе */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            Выбрано:{'\n'}
            {selectedTranslation ? `Перевод: ${selectedTranslation.title}\n` : ''}
            {selectedSeason ? `Сезон: ${selectedSeason.title}\n` : ''}
            {selectedEpisode ? `Серия: ${selectedEpisode.title}` : ''}
          </Text>
        </View>

        {/* Кнопка загрузки видео */}
        <TouchableOpacity
          style={[
            styles.getUrlButton,
            (loadingVideo || (movieData?.translations && movieData.translations.length > 0 && !selectedTranslation)) && styles.getUrlButtonDisabled,
          ]}
          onPress={loadVideoUrl}
          disabled={loadingVideo || (movieData?.translations && movieData.translations.length > 0 && !selectedTranslation)}
        >
          {loadingVideo ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator color="#fff"/>
              <Text style={[styles.getUrlButtonText, {marginLeft: 8}]}>
                Загрузка...
              </Text>
            </View>
          ) : (
            <Text style={styles.getUrlButtonText}>
              {videoUrl ? 'Перезагрузить видео' : 'Загрузить видео'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Автовоспроизведение (только для сериалов) */}
        {movieData.episodes && movieData.episodes.length > 0 && (
          <View style={styles.autoPlayContainer}>
            <View style={styles.autoPlayRow}>
              <Text style={styles.autoPlayLabel}>Автовоспроизведение</Text>
              <Switch
                value={autoPlay}
                onValueChange={setAutoPlay}
                trackColor={{false: '#444', true: '#007AFF'}}
                thumbColor={autoPlay ? '#fff' : '#888'}
              />
            </View>
            {autoPlay && getNextEpisode() && (
              <Text style={styles.nextEpisodeText}>
                Следующая: {getNextEpisode()?.episode.title}
                {getNextEpisode()?.season && ` (${getNextEpisode()?.season?.title})`}
              </Text>
            )}
          </View>
        )}

      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  errorBanner: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ff6b6b',
  },
  errorContent: {
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6b6b',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
    marginBottom: 12,
  },
  errorCloseButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorCloseButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  qualityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.9)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  qualityBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  videoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  videoPlaceholderText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#aaa',
  },
  errorText: {
    fontSize: 16,
    color: '#ff6b6b',
    textAlign: 'center',
  },
  selectorContainer: {
    marginBottom: 20,
  },
  selectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  selectorButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  selectorButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  selectorButtonText: {
    fontSize: 14,
    color: '#ffffff',
  },
  selectorButtonTextActive: {
    color: '#fff',
  },
  infoContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  infoText: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  getUrlButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  getUrlButtonDisabled: {
    backgroundColor: '#A0A0A0',
    opacity: 0.6,
  },
  getUrlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autoPlayContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  autoPlayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoPlayLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  nextEpisodeText: {
    marginTop: 8,
    fontSize: 13,
    color: '#888',
  },
});
