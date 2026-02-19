import { Movie } from './Movie';

export interface ResumeParams {
  translationId?: string;
  seasonId?: string;
  episodeId?: string;
}

export type RootStackParamList = {
  Search: undefined;
  History: undefined;
  Player: {
    movie: Movie;
    resume?: ResumeParams;
  };
  DebugWebView: undefined;
};
