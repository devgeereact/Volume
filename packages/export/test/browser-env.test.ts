import { describe, expect, it } from 'vitest';
import { browserEnv } from '../src/browser.ts';

describe('browserEnv (CHROMIUM_LD_LIBRARY_PATH)', () => {
  it('leaves the environment alone when the setting is unset or blank', () => {
    expect(browserEnv({ PATH: '/bin' })).toBeUndefined();
    expect(browserEnv({ PATH: '/bin', CHROMIUM_LD_LIBRARY_PATH: '  ' })).toBeUndefined();
  });

  it('puts the extra library folder in front of LD_LIBRARY_PATH and keeps the rest', () => {
    expect(browserEnv({ PATH: '/bin', CHROMIUM_LD_LIBRARY_PATH: '/srv/libs' })).toEqual({
      PATH: '/bin',
      CHROMIUM_LD_LIBRARY_PATH: '/srv/libs',
      LD_LIBRARY_PATH: '/srv/libs',
    });
    expect(browserEnv({ CHROMIUM_LD_LIBRARY_PATH: '/srv/libs', LD_LIBRARY_PATH: '/usr/lib64' })?.['LD_LIBRARY_PATH']).toBe('/srv/libs:/usr/lib64');
  });
});
