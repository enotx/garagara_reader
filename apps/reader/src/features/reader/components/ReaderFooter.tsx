import type { PlaybackStatus } from '@garagara/playback';

import type { Translate } from '../../../shared/i18n/i18n.js';
import {
  IconChevronLeft,
  IconChevronRight,
  IconPause,
  IconPlay,
} from '../../../shared/ui/icons';

export function ReaderFooter({
  focusEnabled,
  playbackStatus,
  playbackAvailable,
  focusIndex,
  focusOrderLength,
  subtitlesOn,
  page,
  pageCount,
  chapterIndex,
  chaptersLength,
  overallPercent,
  previousChapter,
  nextChapter,
  t,
  onClick,
  onPrevFocus,
  onNextFocus,
  onToggleSubtitles,
  onTogglePlayback,
  onPrevPage,
  onNextPage,
}: {
  focusEnabled: boolean;
  playbackStatus: PlaybackStatus;
  playbackAvailable: boolean;
  focusIndex: number;
  focusOrderLength: number;
  subtitlesOn: boolean;
  page: number;
  pageCount: number;
  chapterIndex: number;
  chaptersLength: number;
  overallPercent: number;
  previousChapter: boolean;
  nextChapter: boolean;
  t: Translate;
  onClick: () => void;
  onPrevFocus: () => void;
  onNextFocus: () => void;
  onToggleSubtitles: () => void;
  onTogglePlayback: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <footer className={`reader-footer${focusEnabled ? ' focus' : ''}`} onClick={onClick}>
      {focusEnabled ? (
        <>
          <button
            type="button"
            className="reader-button"
            aria-label={t('reader.prevSegment')}
            onClick={(event) => {
              event.stopPropagation();
              onPrevFocus();
            }}
            disabled={focusIndex <= 0}
          >
            <IconChevronLeft size={20} />
          </button>
          <button
            type="button"
            className={`focus-subtitle-toggle${subtitlesOn ? ' is-active' : ''}`}
            aria-label={t('reader.subtitles')}
            aria-pressed={subtitlesOn}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSubtitles();
            }}
          >
            {t('reader.translateShort')}
          </button>
          <button
            type="button"
            className="reader-button"
            aria-label={t('reader.nextSegment')}
            onClick={(event) => {
              event.stopPropagation();
              onNextFocus();
            }}
            disabled={focusIndex < 0 || focusIndex >= focusOrderLength - 1}
          >
            <IconChevronRight size={20} />
          </button>
          <button
            type="button"
            className="reader-button"
            aria-label={playbackStatus === 'playing' ? t('reader.pausePlayback') : t('reader.play')}
            data-playback-toggle
            disabled={!playbackAvailable}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePlayback();
            }}
          >
            {playbackStatus === 'playing' ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="reader-button"
            aria-label={t('reader.prevPage')}
            onClick={(event) => {
              event.stopPropagation();
              onPrevPage();
            }}
            disabled={page === 0 && !previousChapter}
          >
            <IconChevronLeft size={20} />
          </button>
          <div className="reader-progress" aria-live="polite">
            <span className="progress-chapter">
              {t('reader.chapterOf', { current: chapterIndex + 1, total: chaptersLength })}
            </span>
            <span className="progress-separator" aria-hidden="true">
              ·
            </span>
            <span className="progress-meta">
              {t('reader.pageOf', { page: page + 1, pages: pageCount, percent: overallPercent })}
            </span>
          </div>
          <button
            type="button"
            className="reader-button"
            aria-label={t('reader.nextPage')}
            onClick={(event) => {
              event.stopPropagation();
              onNextPage();
            }}
            disabled={page >= pageCount - 1 && !nextChapter}
          >
            <IconChevronRight size={20} />
          </button>
        </>
      )}
    </footer>
  );
}
