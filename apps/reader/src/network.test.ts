import { describe, expect, it } from 'vitest';

import { networkStatusFrom } from './network.js';

describe('network status', () => {
  it('maps Wi-Fi and Ethernet to the Wi-Fi policy kind', () => {
    expect(networkStatusFrom({ online: true, connectionType: 'wifi' })).toEqual({
      online: true,
      kind: 'wifi',
    });
    expect(networkStatusFrom({ online: true, connectionType: 'ethernet' })).toEqual({
      online: true,
      kind: 'wifi',
    });
  });

  it('maps cellular generations to cellular', () => {
    for (const connectionType of ['cellular', '2g', '3g', '4g', '5g']) {
      expect(networkStatusFrom({ connectionType }).kind).toBe('cellular');
    }
  });

  it('treats missing or unknown connection types conservatively', () => {
    expect(networkStatusFrom({})).toEqual({ online: true, kind: 'unknown' });
    expect(networkStatusFrom({ online: false })).toEqual({ online: false, kind: 'unknown' });
    expect(networkStatusFrom({ connectionType: 'bluetooth' }).kind).toBe('unknown');
  });
});
