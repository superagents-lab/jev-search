import { SOURCE_IDS, isSourceId, isWindowId, type SourceId, type WindowId } from './sources';

export interface AskRequest {
  q: string;
  w?: WindowId;
  s?: SourceId[];
  m?: string;
}

export function validateAskRequest(input: unknown): AskRequest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid input');
  }
  const { q, w, s, m } = input as Record<string, unknown>;
  if (typeof q !== 'string' || q.trim().length === 0 || q.length > 300) {
    throw new Error('q must be a non-empty string up to 300 characters');
  }
  const out: AskRequest = { q: q.trim() };
  if (m !== undefined) {
    if (typeof m !== 'string' || m.length === 0 || m.length > 200) throw new Error('m must be a model id');
    out.m = m;
  }
  if (typeof w === 'string' && isWindowId(w)) out.w = w;
  if (Array.isArray(s)) {
    // Bound the raw list before filtering so duplicates and invalid entries count too.
    if (s.length > SOURCE_IDS.length) {
      throw new Error(`s must contain at most ${SOURCE_IDS.length} entries`);
    }
    const ids = [...new Set(s.filter((v): v is SourceId => typeof v === 'string' && isSourceId(v)))];
    if (ids.length > 0) out.s = ids;
  }
  return out;
}
