import { describe, expect, it } from 'vitest';
import { buildCandidates } from '@/lib/candidates';

describe('buildCandidates', () => {
  it('keeps the original first and adds a stripped version', () => {
    const c = buildCandidates('what are people saying about Bun 1.3 this week');
    expect(c[0]).toBe('what are people saying about Bun 1.3 this week');
    expect(c[1]).toBe('Bun 1.3');
    expect(c).toHaveLength(2);
  });
  it('strips source and time phrases', () => {
    expect(buildCandidates('reddit threads about self-hosting Postgres in the last 24 hours')[1]).toBe(
      'self-hosting Postgres'
    );
    expect(buildCandidates('reactions to the latest Claude release on Hacker News')[1]).toBe(
      'reactions to the Claude release'
    );
  });
  it('handles Chinese requests', () => {
    expect(buildCandidates('最近大家怎么看 Bun 1.3')[1]).toBe('Bun 1.3');
  });
  it('strips content-type prefixes', () => {
    expect(buildCandidates('videos about Bun 1.3')[1]).toBe('Bun 1.3');
    expect(buildCandidates('new papers on LLM agents this week')[1]).toBe('LLM agents');
  });
  it('returns one candidate when nothing to strip', () => {
    expect(buildCandidates('Bun 1.3')).toEqual(['Bun 1.3']);
  });
  it('adds a keywords-only candidate for questions', () => {
    expect(buildCandidates('who directed Oppenheimer and who is in it')).toEqual([
      'who directed Oppenheimer and who is in it',
      'directed Oppenheimer',
      'Oppenheimer',
    ]);
  });
});
