import { NavigatorScreenParams } from '@react-navigation/native';
import { Movie } from './Movie';

export interface ResumeParams {
  translationId?: string;
  seasonId?: string;
  episodeId?: string;
}

export type MainTabParamList = {
  Search: undefined;
  NewReleases: undefined;
  History: undefined;
  Downloads: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Player: {
    movie: Movie;
    resume?: ResumeParams;
  };
  DebugWebView: undefined;
  OfflinePlayer: {
    title: string;
    localM3u8Uri: string;
    subtitleUri?: string;
  };
  Blacklist: undefined;
  Watched: undefined;
};
