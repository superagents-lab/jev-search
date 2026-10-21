import { describe, expect, it } from 'vitest';
import { mentionsScope, wordSpans } from '@/lib/spans';

describe('mentionsScope', () => {
  it('flags an engine named as the place to search', () => {
    for (const text of [
      'projects on GitHub using eBPF',
      'GitHub 上支持 Windows 的 OCR',
      'GitHubでTailscaleの設定例',
      'Reddit에서 Bun',
      'примеры Playwright в GitHub',
      'what HN thinks of Bun',
    ]) {
      expect(mentionsScope(text, ['GitHub', 'Reddit', 'HN'])).toBe(true);
    }
  });

  it('keeps product names and words that merely contain an engine name', () => {
    for (const text of ['GitHub Actions cache', 'Reddit API pricing', 'YouTube Shorts ideas', 'GitHub 2FA recovery', 'JOHN smith']) {
      expect(mentionsScope(text, ['GitHub', 'Reddit', 'YouTube', 'HN'])).toBe(false);
    }
  });
});

describe('wordSpans', () => {
  it('keeps the whole text first and drops excluded spans', () => {
    const spans = wordSpans('Bun on GitHub', (s) => s.includes('GitHub'));
    expect(spans).toEqual(['Bun on GitHub', 'Bun', 'Bun on', 'on']);
  });

  it('segments text without spaces', () => {
    expect(wordSpans('东京天气')).toContain('东京');
  });

  it('caps long requests at 255 candidates', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    const spans = wordSpans(long);
    expect(spans[0]).toBe(long);
    expect(spans.length).toBeLessThanOrEqual(255);
  });
});
