export type GestureMode = 'reading' | 'card';

export interface GestureState {
  mode: GestureMode;
  menuOpen: boolean;
  cardWord?: string;
}

export type GestureEvent =
  | {
      type: 'tap';
      target: 'word';
      word: string;
      sentenceId: string;
      sameSentence: boolean;
    }
  | { type: 'tap'; target: 'blank' | 'chrome' }
  | { type: 'tap'; target: 'edge'; side: 'left' | 'right' }
  | { type: 'longPress'; sentenceId: string }
  | { type: 'swipe'; direction: 'left' | 'right' };

export type GestureCommand =
  | { type: 'openCard'; word: string }
  | { type: 'replaceCard'; word: string }
  | { type: 'closeCard' }
  | { type: 'toggleMenu' }
  | { type: 'translateSentence'; sentenceId: string }
  | { type: 'advanceFocus' }
  | { type: 'focusSentence'; sentenceId: string }
  | { type: 'playSentence'; sentenceId: string }
  | { type: 'pausePlayback' }
  | { type: 'browsePlayback' }
  | { type: 'turnPage'; direction: 'next' | 'prev' };

export interface GestureResult {
  state: GestureState;
  commands: GestureCommand[];
}

export interface GestureOptions {
  /** Spec §11.2: edge taps turn pages only when the setting is enabled. */
  edgeTurn?: boolean;
  /** Routes the Focus column of Spec §11.2. */
  focus?: boolean;
  /** Routes the playback column of Spec §11.2. */
  playing?: boolean;
}

export function createGestureState(): GestureState {
  return { mode: 'reading', menuOpen: false };
}

function reading(): GestureState {
  return { mode: 'reading', menuOpen: false };
}

function card(word: string): GestureState {
  return { mode: 'card', menuOpen: false, cardWord: word };
}

function pageCommand(direction: 'next' | 'prev'): GestureCommand {
  return { type: 'turnPage', direction };
}

/**
 * Routes one gesture for the normal-reading, Focus, playback and card-open
 * columns of Spec §11.2.
 */
export function reduceGesture(
  state: GestureState,
  event: GestureEvent,
  options: GestureOptions = {},
): GestureResult {
  const edgeTurn = options.edgeTurn === true;
  const focus = options.focus === true;
  const playing = options.playing === true;

  if (event.type === 'swipe') {
    if (state.mode === 'card') {
      return { state: reading(), commands: [{ type: 'closeCard' }] };
    }
    return {
      state: { ...state, menuOpen: false },
      commands: [
        pageCommand(event.direction === 'left' ? 'next' : 'prev'),
        ...(playing ? [{ type: 'browsePlayback' } satisfies GestureCommand] : []),
      ],
    };
  }

  if (event.type === 'longPress') {
    if (state.mode === 'card') {
      return { state, commands: [] };
    }
    return {
      state: { ...state, menuOpen: false },
      commands: [
        playing
          ? { type: 'playSentence', sentenceId: event.sentenceId }
          : focus
            ? { type: 'focusSentence', sentenceId: event.sentenceId }
            : { type: 'translateSentence', sentenceId: event.sentenceId },
      ],
    };
  }

  if (event.target === 'word') {
    if (state.mode === 'card') {
      return {
        state: card(event.word),
        commands: [{ type: 'replaceCard', word: event.word }],
      };
    }
    if (playing && !event.sameSentence) {
      return {
        state: { ...state, menuOpen: false },
        commands: [{ type: 'advanceFocus' }],
      };
    }
    if (focus && !event.sameSentence) {
      return {
        state: { ...state, menuOpen: false },
        commands: [{ type: 'advanceFocus' }],
      };
    }
    return {
      state: card(event.word),
      commands: playing
        ? [{ type: 'pausePlayback' }, { type: 'openCard', word: event.word }]
        : [{ type: 'openCard', word: event.word }],
    };
  }

  if (event.target === 'chrome') {
    if (state.mode === 'card') {
      return { state: reading(), commands: [{ type: 'closeCard' }] };
    }
    return {
      state: { ...state, menuOpen: !state.menuOpen },
      commands: [{ type: 'toggleMenu' }],
    };
  }

  if (event.target === 'edge') {
    if (state.mode === 'card') {
      return { state: reading(), commands: [{ type: 'closeCard' }] };
    }
    if (!edgeTurn) {
      return {
        state: { ...state, menuOpen: !state.menuOpen },
        commands: [{ type: 'toggleMenu' }],
      };
    }
    return {
      state: { ...state, menuOpen: false },
      commands: [
        pageCommand(event.side === 'right' ? 'next' : 'prev'),
        ...(playing ? [{ type: 'browsePlayback' } satisfies GestureCommand] : []),
      ],
    };
  }

  if (state.mode === 'card') {
    return { state: reading(), commands: [{ type: 'closeCard' }] };
  }
  if (playing) {
    return { state, commands: [] };
  }
  if (focus) {
    return {
      state: { ...state, menuOpen: false },
      commands: [{ type: 'advanceFocus' }],
    };
  }
  return {
    state: { ...state, menuOpen: !state.menuOpen },
    commands: [{ type: 'toggleMenu' }],
  };
}
