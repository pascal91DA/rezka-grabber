export interface StreamQuality {
  quality: string;
  url: string;
}

export interface SubtitleTrack {
  title: string;
  url: string;
  language?: string; // ISO 639-1 код, если известен из subtitle_lns
}

export interface StreamInfo {
  streams: StreamQuality[];
  selectedStream?: StreamQuality;
  subtitles?: SubtitleTrack[];
}
