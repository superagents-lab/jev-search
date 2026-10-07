/**
 * Minimal Jev client plus the two judgments this app needs.
 *
 * Jev and Clef are served by providers that speak slightly different dialects of
 * the same decision API. The rest of the app only sees the TypeSafe shapes
 * declared here, and a provider chain: the first provider is primary and the
 * others are tried in order when it is out of credit, throttled or failing.
 * - TypeSafe System One. Docs: https://docs.typesafe.ai/api
 * - Vercel AI Gateway, model `typesafe-ai/jev`. Docs: https://vercel.com/ai-gateway/models/jev
 * - Cloudflare Workers AI binding, model `typesafe/jev`.
 *   Docs: https://developers.cloudflare.com/ai/models/typesafe/jev/
 * - Cloudflare Workers AI binding, models `@cf/cloudflare/clef` and `@cf/cloudflare/clef-flash`.
 *   Docs: https://developers.cloudflare.com/workers-ai/models/clef/
 * - OpenAI Decisions API, model `gpt-6-luna`. Docs: https://developers.openai.com/api/docs/guides/decisions
 */
import { SOURCES, WINDOWS, type SourceId, type WindowId } from './sources';

export type ProviderId = 'typesafe' | 'vercel' | 'cloudflare' | 'clef' | 'clef-flash' | 'openai';

/** The part of Cloudflare's `Ai` binding this client uses. */
export interface JevBinding {
  run(model: string, inputs: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export type ProviderConfig =
  | { provider: 'typesafe'; apiKey: string; model?: string; baseUrl?: string }
  | { provider: 'vercel'; apiKey: string; model?: string }
  | { provider: 'cloudflare'; ai: JevBinding; model?: string }
  | { provider: 'clef' | 'clef-flash'; ai: JevBinding }
  | { provider: 'openai'; apiKey: string; model?: string };

export interface JudgeConfig {
  /** Ordered: the first provider is primary, the rest are fallbacks. */
  providers: ProviderConfig[];
}

type NoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria?: { true?: string; false?: string };
};
type ChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
};
type Question = NoulQuestion | ChoiceQuestion;

type NoulAnswer = { type: 'noul'; noul: number };
type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
type Answer = NoulAnswer | ChoiceAnswer;

export interface SystemOneResponse {
  model: string;
  /** Which provider produced the answers. */
  provider: ProviderId;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

export class TypeSafeError extends Error {
  status: number;
  provider: ProviderId;
  constructor(status: number, message: string, provider: ProviderId = 'typesafe') {
    super(message);
    this.name = 'TypeSafeError';
    this.status = status;
    this.provider = provider;
  }
}

const TYPESAFE_BASE_URL = 'https://api.typesafe.ai';
const TYPESAFE_MODEL = 'jev-latest';
const VERCEL_URL = 'https://ai-gateway.vercel.sh/v4/ai/evaluation-model';
const VERCEL_MODEL = 'typesafe-ai/jev';
const CLOUDFLARE_MODEL = 'typesafe/jev';
const OPENAI_URL = 'https://api.openai.com/v1/decisions';
export const OPENAI_MODEL = 'gpt-6-luna';

function failureMessage(status: number, provider: ProviderId): string {
  // Provider error bodies are implementation details and may contain request data.
  const model =
    provider === 'clef' ? 'Clef' : provider === 'clef-flash' ? 'Clef-flash' : provider === 'openai' ? 'GPT-6 Luna' : 'Jev';
  if (status >= 500) return `${model} is temporarily unavailable. Please try again shortly.`;
  if (status === 429) return `${model} is receiving too many requests. Please try again shortly.`;
  return `${model} could not process this request (HTTP ${status}).`;
}

async function postJson(
  provider: ProviderId,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new TypeSafeError(response.status, failureMessage(response.status, provider), provider);
  }
  return response.json();
}

type NativeResponse = Omit<SystemOneResponse, 'provider'>;

function normalise(
  provider: ProviderId,
  model: string,
  body: Partial<NativeResponse> | null | undefined
): SystemOneResponse {
  return {
    model: body?.model ?? model,
    provider,
    answers: body?.answers ?? {},
    usage: {
      input_tokens: body?.usage?.input_tokens ?? 0,
      output_tokens: body?.usage?.output_tokens ?? 0,
    },
  };
}

// TypeSafe: the reference dialect.
async function callTypeSafe(
  config: Extract<ProviderConfig, { provider: 'typesafe' }>,
  state: unknown,
  questions: Record<string, Question>,
  signal?: AbortSignal
): Promise<SystemOneResponse> {
  const model = config.model ?? TYPESAFE_MODEL;
  const baseUrl = config.baseUrl?.trim().replace(/\/+$/, '') || TYPESAFE_BASE_URL;
  const body = await postJson(
    'typesafe',
    `${baseUrl}/v1/systemone`,
    { Authorization: `Bearer ${config.apiKey}` },
    { state, model, questions },
    signal
  );
  return normalise('typesafe', model, body as Partial<NativeResponse>);
}

// Cloudflare Workers AI: same dialect, delivered through the `AI` binding.
async function callCloudflare(
  config: Extract<ProviderConfig, { ai: JevBinding }>,
  state: unknown,
  questions: Record<string, Question>,
  signal?: AbortSignal
): Promise<SystemOneResponse> {
  const model = config.provider === 'cloudflare' ? (config.model ?? CLOUDFLARE_MODEL) : config.provider;
  const bindingModel = config.provider === 'cloudflare' ? model : `@cf/cloudflare/${model}`;
  const inputs = config.provider === 'cloudflare' ? { state, questions } : { model, state, questions };
  let body: unknown;
  try {
    body = await config.ai.run(bindingModel, inputs, signal ? { signal } : {});
  } catch (error) {
    if (signal?.aborted) throw error;
    const status = bindingStatus(error);
    // The binding's message is a Cloudflare error string, not request data; keep it in server logs.
    console.warn(`[jev] ${config.provider} binding failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    throw new TypeSafeError(status, failureMessage(status, config.provider), config.provider);
  }
  return normalise(config.provider, model, body as Partial<NativeResponse>);
}

/** The binding reports upstream failures as thrown errors; recover an HTTP-like status from the message. */
function bindingStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  // Seen in the wild: "AiGatewayError: 2021: Insufficient AI Gateway credits" (binding) and
  // "2049: Insufficient balance; add money to your gateway" (REST).
  if (/insufficient .*(balance|credits)|\b(2021|2049)\b/i.test(message)) return 402;
  if (/rate.?limit|too many requests|\b429\b/i.test(message)) return 429;
  const code = /\b(4\d\d|5\d\d)\b/.exec(message);
  return code ? Number(code[1]) : 502;
}

// Vercel AI Gateway: the AI SDK evaluation-model dialect (specification v4).
type GatewayQuestion =
  | ChoiceQuestion
  | { type: 'boolean'; instructions: string; criteria?: { true?: string; false?: string } };
type GatewayAnswer =
  | { type: 'choice'; choice: string; probabilities?: Record<string, number> }
  | { type: 'boolean'; probability: number }
  | { type: 'score'; score: number; probabilities?: Record<string, number> };
interface GatewayResponse {
  answers?: Record<string, GatewayAnswer>;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** TypeSafe forwards its per-question confidence here. */
  providerMetadata?: { typesafe?: { confidence?: Record<string, number> } };
}

function toGatewayQuestion(question: Question): GatewayQuestion {
  if (question.type !== 'noul') return question;
  return {
    type: 'boolean',
    instructions: question.instructions,
    ...(question.criteria ? { criteria: question.criteria } : {}),
  };
}

function fromGatewayAnswer(answer: GatewayAnswer, confidence: number | undefined): Answer | undefined {
  if (answer.type === 'boolean') return { type: 'noul', noul: answer.probability };
  if (answer.type === 'choice') {
    const probabilities = answer.probabilities ?? { [answer.choice]: 1 };
    // TypeSafe's confidence arrives in provider metadata; the chosen option's probability is the stand-in.
    return {
      type: 'choice',
      choice: answer.choice,
      probabilities,
      confidence: confidence ?? probabilities[answer.choice] ?? 1,
    };
  }
  return undefined;
}

async function callVercel(
  config: Extract<ProviderConfig, { provider: 'vercel' }>,
  state: unknown,
  questions: Record<string, Question>,
  signal?: AbortSignal
): Promise<SystemOneResponse> {
  const model = config.model ?? VERCEL_MODEL;
  const body = (await postJson(
    'vercel',
    VERCEL_URL,
    {
      Authorization: `Bearer ${config.apiKey}`,
      'ai-gateway-auth-method': 'api-key',
      'ai-gateway-protocol-version': '0.0.1',
      'ai-evaluation-model-specification-version': '4',
      'ai-model-id': model,
    },
    {
      state,
      questions: Object.fromEntries(
        Object.entries(questions).map(([id, question]) => [id, toGatewayQuestion(question)])
      ),
    },
    signal
  )) as GatewayResponse;
  const confidence = body.providerMetadata?.typesafe?.confidence ?? {};
  const answers: Record<string, Answer> = {};
  for (const [id, answer] of Object.entries(body.answers ?? {})) {
    const converted = fromGatewayAnswer(answer, confidence[id]);
    if (converted) answers[id] = converted;
  }
  return {
    model,
    provider: 'vercel',
    answers,
    usage: { input_tokens: body.usage?.inputTokens ?? 0, output_tokens: body.usage?.outputTokens ?? 0 },
  };
}

// OpenAI Decisions API: questions are a named array, `noul` is `predicate`, and evidence is text.
type OpenAIQuestion =
  | { type: 'predicate'; name: string; instructions: string }
  | { type: 'choice'; name: string; instructions: string; choices: { value: string; description?: string }[] };
type OpenAIAnswer =
  | { type: 'predicate'; name: string; probability: number }
  | {
      type: 'choice';
      name: string;
      choice: string;
      probabilities?: { value: string; probability: number }[];
      confidence?: number;
    }
  // Returned without a probability when the model declines a question; such answers are dropped.
  | { type: 'refusal' | 'score'; name: string };
interface OpenAIResponse {
  model?: string;
  answers?: OpenAIAnswer[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function toOpenAIQuestion(name: string, question: Question): OpenAIQuestion {
  if (question.type === 'choice') {
    return {
      type: 'choice',
      name,
      instructions: question.instructions,
      choices: Object.entries(question.criteria).map(([value, description]) =>
        description ? { value, description } : { value }
      ),
    };
  }
  // Predicates have no criteria field (the API rejects it), so the criteria become part of the instructions.
  const { true: yes, false: no } = question.criteria ?? {};
  const instructions = [
    question.instructions,
    ...(yes ? [`True when: ${yes}`] : []),
    ...(no ? [`False when: ${no}`] : []),
  ].join('\n');
  return { type: 'predicate', name, instructions };
}

function fromOpenAIAnswer(answer: OpenAIAnswer): Answer | undefined {
  if (answer.type === 'predicate') return { type: 'noul', noul: answer.probability };
  if (answer.type === 'choice') {
    const probabilities = answer.probabilities?.length
      ? Object.fromEntries(answer.probabilities.map((p) => [p.value, p.probability]))
      : { [answer.choice]: 1 };
    return {
      type: 'choice',
      choice: answer.choice,
      probabilities,
      confidence: answer.confidence ?? probabilities[answer.choice] ?? 1,
    };
  }
  return undefined;
}

async function callOpenAI(
  config: Extract<ProviderConfig, { provider: 'openai' }>,
  state: unknown,
  questions: Record<string, Question>,
  signal?: AbortSignal
): Promise<SystemOneResponse> {
  const model = config.model ?? OPENAI_MODEL;
  const body = (await postJson(
    'openai',
    OPENAI_URL,
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model,
      // The state keeps its field names, so instructions can still refer to `request` or `results[i]`.
      input: typeof state === 'string' ? state : JSON.stringify(state),
      questions: Object.entries(questions).map(([name, question]) => toOpenAIQuestion(name, question)),
    },
    signal
  )) as OpenAIResponse;
  const answers: Record<string, Answer> = {};
  for (const answer of body.answers ?? []) {
    const converted = fromOpenAIAnswer(answer);
    if (converted) answers[answer.name] = converted;
  }
  return {
    model: body.model ?? model,
    provider: 'openai',
    answers,
    usage: { input_tokens: body.usage?.input_tokens ?? 0, output_tokens: body.usage?.output_tokens ?? 0 },
  };
}

function callProvider(
  config: ProviderConfig,
  state: unknown,
  questions: Record<string, Question>,
  signal?: AbortSignal
): Promise<SystemOneResponse> {
  switch (config.provider) {
    case 'vercel':
      return callVercel(config, state, questions, signal);
    case 'openai':
      return callOpenAI(config, state, questions, signal);
    case 'cloudflare':
    case 'clef':
    case 'clef-flash':
      return callCloudflare(config, state, questions, signal);
    default:
      return callTypeSafe(config, state, questions, signal);
  }
}

/** Failures worth retrying elsewhere: no credit, throttled, or the service is down. */
export function isProviderOutage(error: unknown): boolean {
  return error instanceof TypeSafeError && (error.status === 402 || error.status === 429 || error.status >= 500);
}

/** Asks the provider chain; each fallback is tried once, in order, for outages only. */
export async function systemOne(
  config: JudgeConfig,
  state: unknown,
  questions: Record<string, Question>,
  signal?: AbortSignal
): Promise<SystemOneResponse> {
  if (config.providers.length === 0) throw new Error('No decision provider is configured');
  for (let index = 0; ; index++) {
    const provider = config.providers[index]!;
    try {
      return await callProvider(provider, state, questions, signal);
    } catch (error) {
      const next = config.providers[index + 1];
      if (!next || !isProviderOutage(error) || signal?.aborted) throw error;
      const failed = error as TypeSafeError;
      console.warn(`[jev] ${failed.provider} returned HTTP ${failed.status}; retrying with ${next.provider}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Judgment 1: what does the request ask for?
// ---------------------------------------------------------------------------

export interface Intent {
  window: { choice: WindowId; confidence: number };
  /** Probability that the user specifically wants each source. */
  sources: Record<SourceId, number>;
  /** Index into the candidates array the caller passed in. */
  query: { index: number; confidence: number };
  /** Candidate that is just the name or title being asked about, for catalogue engines. */
  entity: { index: number; confidence: number };
  usage: SystemOneResponse['usage'];
  /** Which provider answered. */
  provider: ProviderId;
}

export async function inferIntent(
  config: JudgeConfig,
  input: { request: string; candidates: string[]; now: Date },
  signal?: AbortSignal
): Promise<Intent> {
  const questions: Record<string, Question> = {};

  const windowCriteria: Record<string, string> = {};
  for (const w of WINDOWS) windowCriteria[w.id] = w.description;
  questions.window = {
    type: 'choice',
    instructions:
      'Does the request in `request` ask for recent results, and if so how recent? Judge only from what the request says or clearly implies; `now` is the current date. A request with no time cue wants any time.',
    criteria: windowCriteria,
  };

  for (const s of SOURCES) {
    questions[`source_${s.id}`] = {
      type: 'noul',
      instructions: `About \`request\`: ${s.ask.question}`,
      criteria: { true: s.ask.yes, false: s.ask.no },
    };
  }

  if (input.candidates.length > 1) {
    const criteria: Record<string, string> = {};
    input.candidates.forEach((c, i) => {
      criteria[`c${i}`] = c;
    });
    questions.query = {
      type: 'choice',
      instructions:
        'Which candidate in `candidates` is the best keyword query to send to a web search engine so the results match what the user is asking for in `request`? Prefer the candidate that keeps the subject and drops words about time, sources or phrasing that a search engine would treat as keywords.',
      criteria,
    };
    questions.entity = {
      type: 'choice',
      instructions:
        'Which candidate in `candidates` is just the name or title of the thing the user is asking about in `request`, as you would type it into a catalogue such as IMDb or a library index? Prefer the shortest candidate that is still the full proper name.',
      criteria,
    };
  }

  const state = {
    request: input.request,
    now: input.now.toISOString().slice(0, 10),
    candidates: Object.fromEntries(input.candidates.map((c, i) => [`c${i}`, c])),
  };

  const res = await systemOne(config, state, questions, signal);

  const windowAnswer = res.answers.window;
  const window =
    windowAnswer?.type === 'choice'
      ? {
          choice: windowAnswer.choice as WindowId,
          confidence: windowAnswer.confidence,
        }
      : { choice: 'any' as const, confidence: 0 };

  const sources = {} as Record<SourceId, number>;
  for (const s of SOURCES) {
    const a = res.answers[`source_${s.id}`];
    sources[s.id] = a?.type === 'noul' ? a.noul : 0;
  }

  const queryAnswer = res.answers.query;
  const query =
    queryAnswer?.type === 'choice'
      ? {
          index: Number(queryAnswer.choice.slice(1)) || 0,
          confidence: queryAnswer.confidence,
        }
      : { index: 0, confidence: 1 };

  const entityAnswer = res.answers.entity;
  const entity =
    entityAnswer?.type === 'choice'
      ? { index: Number(entityAnswer.choice.slice(1)) || 0, confidence: entityAnswer.confidence }
      : query;

  return { window, sources, query, entity, usage: res.usage, provider: res.provider };
}

// ---------------------------------------------------------------------------
// Judgment 2: is each result about what was asked?
// ---------------------------------------------------------------------------

export interface RerankInput {
  id: string;
  source: string;
  title: string;
  snippet: string;
}

const RERANK_BATCH = 40;

export async function rerank(
  config: JudgeConfig,
  request: string,
  items: RerankInput[],
  signal?: AbortSignal
): Promise<{ relevance: Record<string, number>; usage: SystemOneResponse['usage'] }> {
  const relevance: Record<string, number> = {};
  const usage = { input_tokens: 0, output_tokens: 0 };
  if (items.length === 0) return { relevance, usage };

  const batches: RerankInput[][] = [];
  for (let i = 0; i < items.length; i += RERANK_BATCH) {
    batches.push(items.slice(i, i + RERANK_BATCH));
  }

  const responses = await Promise.all(
    batches.map((batch) => {
      const questions: Record<string, Question> = {};
      batch.forEach((_, i) => {
        questions[`r${i}`] = {
          type: 'noul',
          instructions: `Is \`results[${i}]\` about the subject the user asked for in \`request\`?`,
          criteria: {
            true: 'The title or snippet discusses the same subject the user asked about, even briefly or as one of several topics',
            false: 'The result is about something else that only shares words with the request (a different meaning of the same word, a different product, a person with the same name) or is unrelated',
          },
        };
      });
      const state = {
        request,
        results: batch.map((it) => ({
          source: it.source,
          title: it.title,
          snippet: it.snippet,
        })),
      };
      return systemOne(config, state, questions, signal);
    })
  );

  responses.forEach((res, b) => {
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    batches[b]!.forEach((item, i) => {
      const a = res.answers[`r${i}`];
      relevance[item.id] = a?.type === 'noul' ? a.noul : 0;
    });
  });

  return { relevance, usage };
}
