export interface StreamQuality {
  quality: string;
  url: string;
}

export interface StreamInfo {
  streams: StreamQuality[];
  selectedStream?: StreamQuality;
}
