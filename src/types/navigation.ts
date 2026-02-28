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
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Player: {
    movie: Movie;
    resume?: ResumeParams;
  };
  DebugWebView: undefined;
};
