import type { PlaybackEngine, PlaybackStatus } from '@garagara/playback';
import type { PlayableSentence } from '@garagara/storage';

export interface ReaderPlayback {
  engine: PlaybackEngine;
  status: PlaybackStatus;
  sentence?: PlayableSentence;
  browsing: boolean;
  onBrowsingChange: (browsing: boolean) => void;
}
