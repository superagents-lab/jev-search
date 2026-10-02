import { describe, expect, it } from 'vitest';
import { SOURCE_IDS } from '@/lib/sources';
import { validateAskRequest } from '@/lib/validate';

describe('search source validation', () => {
  it('accepts a bounded model choice for the server to check against configured models', () => {
    expect(validateAskRequest({ q: 'Bun', m: 'clef' })).toEqual({ q: 'Bun', m: 'clef' });
    expect(() => validateAskRequest({ q: 'Bun', m: { provider: 'clef' } })).toThrow('m must be a model id');
  });
  it('deduplicates valid sources while preserving their first occurrence', () => {
    expect(validateAskRequest({ q: ' Bun ', w: '7d', s: ['reddit', 'github', 'reddit', 'invalid', null, 'github'] }))
      .toEqual({ q: 'Bun', w: '7d', s: ['reddit', 'github'] });
  });

  it('allows selecting every supported source once', () => {
    expect(validateAskRequest({ q: 'Bun', s: [...SOURCE_IDS] }).s).toEqual(SOURCE_IDS);
  });

  it('deduplicates a repeated source at the list length limit', () => {
    expect(validateAskRequest({ q: 'Bun', s: Array(SOURCE_IDS.length).fill('reddit') }).s)
      .toEqual(['reddit']);
  });

  it.each(['reddit', 'invalid'])('rejects an oversized list even when it repeats %s', (source) => {
    expect(() => validateAskRequest({ q: 'Bun', s: Array(SOURCE_IDS.length + 1).fill(source) }))
      .toThrow(`s must contain at most ${SOURCE_IDS.length} entries`);
  });

  it('still allows inferred sources when no valid source was selected', () => {
    expect(validateAskRequest({ q: 'Bun', s: ['invalid', null] })).toEqual({ q: 'Bun' });
  });
});
