import { describe, expect, it } from 'vitest';

import * as core from './index.js';

describe('workspace', () => {
  it('loads the core package through its ESM entry', () => {
    expect(core).toBeTypeOf('object');
  });
});
