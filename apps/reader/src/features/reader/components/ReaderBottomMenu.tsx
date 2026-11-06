import type { Translate } from '../../../shared/i18n/i18n.js';
import type { FocusUnit } from '../focus/focus.js';

export function ReaderBottomMenu({
  fontScale,
  focusEnabled,
  focusUnit,
  edgeTurn,
  t,
  onAdjustFont,
  onToggleFocus,
  onChangeFocusUnit,
  onToggleEdgeTurn,
}: {
  fontScale: number;
  focusEnabled: boolean;
  focusUnit: FocusUnit;
  edgeTurn: boolean;
  t: Translate;
  onAdjustFont: (delta: number) => void;
  onToggleFocus: () => void;
  onChangeFocusUnit: (unit: FocusUnit) => void;
  onToggleEdgeTurn: (value: boolean) => void;
}) {
  return (
    <div className="reader-menu reader-menu-bottom" data-menu="bottom">
      <div className="font-controls">
        <button
          type="button"
          className="reader-button"
          aria-label={t('reader.decreaseFont')}
          onClick={() => onAdjustFont(-10)}
        >
          A−
        </button>
        <span className="font-scale-value">{fontScale}%</span>
        <button
          type="button"
          className="reader-button"
          aria-label={t('reader.increaseFont')}
          onClick={() => onAdjustFont(10)}
        >
          A+
        </button>
      </div>
      <button
        type="button"
        className={`reader-button focus-toggle${focusEnabled ? ' solid' : ''}`}
        aria-pressed={focusEnabled}
        onClick={onToggleFocus}
      >
        Focus
      </button>
      <label className="menu-field focus-unit-field">
        <span className="menu-field-label">{t('reader.focusUnit')}</span>
        <select
          className="theme-select"
          aria-label={t('reader.focusUnitAria')}
          value={focusUnit}
          onChange={(event) => onChangeFocusUnit(event.target.value as FocusUnit)}
        >
          <option value="sentence">{t('reader.unitSentence')}</option>
          <option value="chunk">{t('reader.unitChunk')}</option>
        </select>
      </label>
      <label className="edge-turn-field">
        <input
          type="checkbox"
          aria-label={t('reader.edgeTurnAria')}
          checked={edgeTurn}
          onChange={(event) => onToggleEdgeTurn(event.target.checked)}
        />
        <span>{t('reader.edgeTurn')}</span>
      </label>
      <span className="menu-note">{t('reader.layoutNote')}</span>
    </div>
  );
}
