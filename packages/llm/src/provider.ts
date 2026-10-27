export type LlmErrorKind =
  'config' | 'network' | 'timeout' | 'aborted' | 'http' | 'invalid_response';

/** Structured failure from the LLM provider. `retryable` mirrors the retry policy. */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    kind: LlmErrorKind,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'LlmError';
    this.kind = kind;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export interface LlmProviderConfig {
  /** OpenAI-compatible API root, for example `https://api.openai.com/v1`. */
  baseURL: string;
  model: string;
  /** Sent as a Bearer token. Leave empty for local servers that do not require auth. */
  apiKey?: string;
  /** Per-attempt timeout in milliseconds. Defaults to 15000 (Spec §9.1). */
  timeoutMs?: number;
  /** Number of retries after the first attempt. Defaults to 1 (Spec §9.1). */
  retries?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  messages: readonly ChatMessage[];
  /** `json` sends `response_format: { type: 'json_object' }` (Spec §9.2). */
  responseFormat?: 'text' | 'json';
  temperature?: number;
  /** Cancels the request; an already-aborted signal rejects immediately. */
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage?:
    | {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      }
    | undefined;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<FetchResponseLike>;

export interface LlmProviderOptions {
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: FetchLike;
  /** Delay before the first retry. Defaults to 400 ms; grows linearly per retry. */
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 400;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function abortError(): LlmError {
  return new LlmError('aborted', 'LLM request was aborted', { retryable: false });
}

function chatCompletionsUrl(baseURL: string): string {
  const trimmed = baseURL.trim();
  if (!trimmed) {
    throw new LlmError('config', 'LLM baseURL is required', { retryable: false });
  }
  let url: URL;
  try {
    url = new URL(
      trimmed.endsWith('/') ? `${trimmed}chat/completions` : `${trimmed}/chat/completions`,
    );
  } catch (error) {
    throw new LlmError('config', `Invalid LLM baseURL: ${trimmed}`, {
      retryable: false,
      cause: error,
    });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LlmError('config', `Unsupported LLM baseURL protocol: ${url.protocol}`, {
      retryable: false,
    });
  }
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readUsage(payload: Record<string, unknown>): ChatCompletionResult['usage'] {
  const usage = asRecord(payload.usage);
  if (!usage) {
    return undefined;
  }
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;
  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    typeof totalTokens !== 'number'
  ) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens };
}

function readCompletion(payload: unknown, fallbackModel: string): ChatCompletionResult {
  const root = asRecord(payload);
  const choices = root?.choices;
  const first = Array.isArray(choices) ? asRecord(choices[0]) : undefined;
  const message = first ? asRecord(first.message) : undefined;
  const content = message?.content;
  if (typeof content !== 'string') {
    throw new LlmError('invalid_response', 'LLM response has no message content', {
      retryable: false,
    });
  }
  const model = typeof root?.model === 'string' && root.model ? root.model : fallbackModel;
  const usage = root ? readUsage(root) : undefined;
  return usage ? { content, model, usage } : { content, model };
}

/**
 * Minimal OpenAI-compatible chat completions client. Enforces the timeout,
 * single retry and cancellation contract from Spec §9.1 without touching
 * storage or the UI.
 */
export class OpenAiCompatibleProvider {
  private readonly config: LlmProviderConfig;
  private readonly fetchImpl: FetchLike;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: LlmProviderConfig, options: LlmProviderOptions = {}) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.config = config;
    this.fetchImpl = (input, init) => fetchImpl(input, init);
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (!this.config.model.trim()) {
      throw new LlmError('config', 'LLM model is required', { retryable: false });
    }
    if (request.messages.length === 0) {
      throw new LlmError('config', 'At least one chat message is required', { retryable: false });
    }
    const endpoint = chatCompletionsUrl(this.config.baseURL);
    const retries = Math.max(0, Math.floor(this.config.retries ?? DEFAULT_RETRIES));
    let lastError: LlmError | undefined;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.attempt(endpoint, request);
      } catch (error) {
        const llmError =
          error instanceof LlmError
            ? error
            : new LlmError(
                'network',
                error instanceof Error ? error.message : 'LLM request failed',
                {
                  retryable: true,
                  cause: error,
                },
              );
        if (!llmError.retryable || attempt >= retries) {
          throw llmError;
        }
        lastError = llmError;
        await this.sleep(this.retryDelayMs * (attempt + 1));
      }
    }

    throw lastError ?? new LlmError('network', 'LLM request failed', { retryable: false });
  }

  private async attempt(
    endpoint: string,
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResult> {
    const externalSignal = request.signal;
    if (externalSignal?.aborted) {
      throw abortError();
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = (): void => controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify(this.requestBody(request)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim().slice(0, 300);
        throw new LlmError(
          'http',
          `LLM request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new LlmError('invalid_response', 'LLM response body is not valid JSON', {
          retryable: true,
          cause: error,
        });
      }
      return readCompletion(payload, this.config.model);
    } catch (error) {
      if (externalSignal?.aborted) {
        throw abortError();
      }
      if (timedOut) {
        throw new LlmError('timeout', `LLM request timed out after ${timeoutMs} ms`, {
          retryable: true,
          cause: error,
        });
      }
      if (error instanceof LlmError) {
        throw error;
      }
      throw new LlmError('network', error instanceof Error ? error.message : 'LLM request failed', {
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onAbort);
    }
  }

  private requestBody(request: ChatCompletionRequest): Record<string, unknown> {
    return {
      model: this.config.model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: false,
      ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    };
  }
}
