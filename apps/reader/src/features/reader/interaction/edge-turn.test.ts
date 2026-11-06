import { describe, expect, it } from 'vitest';

import {
  parseEdgeTurnPreference,
  resolveEdgeTurn,
  EDGE_TURN_GUTTER,
} from './edge-turn.js';

describe('edge turn preference', () => {
  it('parses explicit preferences', () => {
    expect(parseEdgeTurnPreference('true')).toBe(true);
    expect(parseEdgeTurnPreference('false')).toBe(false);
    expect(parseEdgeTurnPreference(null)).toBeUndefined();
    expect(parseEdgeTurnPreference('yes')).toBeUndefined();
  });

  it('defaults on for e-ink and off for other themes', () => {
    expect(resolveEdgeTurn(undefined, 'eink')).toBe(true);
    expect(resolveEdgeTurn(undefined, 'light')).toBe(false);
    expect(resolveEdgeTurn(undefined, 'dark')).toBe(false);
  });

  it('lets an explicit preference override the theme default', () => {
    expect(resolveEdgeTurn(false, 'eink')).toBe(false);
    expect(resolveEdgeTurn(true, 'light')).toBe(true);
  });

  it('reserves a readable edge gutter', () => {
    expect(EDGE_TURN_GUTTER).toBeGreaterThanOrEqual(24);
  });
});
