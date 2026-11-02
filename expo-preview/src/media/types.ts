export type MediaKind = 'image' | 'audio';

/** Only relative filenames are persisted; app container paths change on iOS. */
export type MediaItem = {
  version: 1;
  id: string;
  kind: MediaKind;
  fileName: string;
  title: string;
  mimeType: string;
  createdAt: number;
  sizeBytes: number;
  durationMs?: number;
};

export type CapturedMedia = {
  id?: string;
  kind: MediaKind;
  uri: string;
  title?: string;
  mimeType?: string;
  durationMs?: number;
};

export const newMediaId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
