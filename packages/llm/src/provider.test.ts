import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { LlmError, OpenAiCompatibleProvider } from './provider.js';

interface RecordedRequest {
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface TestServer {
  baseURL: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

type Handler = (request: RecordedRequest, response: ServerResponse) => void;

const servers: TestServer[] = [];

async function startServer(handler: Handler): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      const recorded = {
        url: request.url ?? '',
        headers: request.headers,
        body,
      };
      requests.push(recorded);
      handler(recorded, response);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  const testServer: TestServer = {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  servers.push(testServer);
  return testServer;
}

function jsonResponse(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function chatPayload(content: string): unknown {
  return {
    id: 'chatcmpl-test',
    model: 'mock-model',
    choices: [{ index: 0, message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('OpenAiCompatibleProvider', () => {
  it('posts a chat completion with auth and JSON response format', async () => {
    const server = await startServer((_request, response) => {
      jsonResponse(response, 200, chatPayload('{"translation":"你好"}'));
    });
    const provider = new OpenAiCompatibleProvider({
      baseURL: server.baseURL,
      model: 'test-model',
      apiKey: 'secret-key',
    });

    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'Return JSON.' },
        { role: 'user', content: 'Translate: hello' },
      ],
      responseFormat: 'json',
      temperature: 0,
    });

    expect(result).toEqual({
      content: '{"translation":"你好"}',
      model: 'mock-model',
      usage: { promptTokens: 12, completionTokens: 7, totalTokens: 19 },
    });

    expect(server.requests).toHaveLength(1);
    const request = server.requests[0];
    expect(request?.url).toBe('/v1/chat/completions');
    expect(request?.headers.authorization).toBe('Bearer secret-key');
    expect(request?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request?.body ?? '{}')).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'Return JSON.' },
        { role: 'user', content: 'Translate: hello' },
      ],
      stream: false,
      response_format: { type: 'json_object' },
      temperature: 0,
    });
  });

  it('retries once after a 500 response and succeeds', async () => {
    let calls = 0;
    const server = await startServer((_request, response) => {
      calls += 1;
      if (calls === 1) {
        jsonResponse(response, 500, { error: { message: 'temporary' } });
        return;
      }
      jsonResponse(response, 200, chatPayload('ok'));
    });
    const provider = new OpenAiCompatibleProvider(
      { baseURL: server.baseURL, model: 'test-model', retries: 1 },
      { retryDelayMs: 0 },
    );

    const result = await provider.complete({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.content).toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not retry a 401 response', async () => {
    let calls = 0;
    const server = await startServer((_request, response) => {
      calls += 1;
      jsonResponse(response, 401, { error: { message: 'invalid key' } });
    });
    const provider = new OpenAiCompatibleProvider(
      { baseURL: server.baseURL, model: 'test-model', retries: 1 },
      { retryDelayMs: 0 },
    );

    const failure = provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
    await expect(failure).rejects.toBeInstanceOf(LlmError);
    await expect(failure).rejects.toMatchObject({ kind: 'http', status: 401, retryable: false });
    expect(calls).toBe(1);
  });

  it('times out a stalled request', async () => {
    const server = await startServer(() => {
      // Intentionally never respond.
    });
    const provider = new OpenAiCompatibleProvider({
      baseURL: server.baseURL,
      model: 'test-model',
      timeoutMs: 30,
      retries: 0,
    });

    const failure = provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
    await expect(failure).rejects.toMatchObject({ kind: 'timeout', retryable: true });
    expect(server.requests).toHaveLength(1);
  });

  it('cancels the in-flight request without retrying', async () => {
    let calls = 0;
    const server = await startServer((_request, response) => {
      calls += 1;
      setTimeout(() => {
        jsonResponse(response, 200, chatPayload('late'));
      }, 200);
    });
    const provider = new OpenAiCompatibleProvider({
      baseURL: server.baseURL,
      model: 'test-model',
      retries: 1,
    });
    const controller = new AbortController();
    const pending = provider.complete({
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);

    await expect(pending).rejects.toMatchObject({ kind: 'aborted', retryable: false });
    expect(calls).toBe(1);
  });

  it('rejects an already-aborted signal without calling the server', async () => {
    const server = await startServer((_request, response) => {
      jsonResponse(response, 200, chatPayload('unused'));
    });
    const provider = new OpenAiCompatibleProvider({
      baseURL: server.baseURL,
      model: 'test-model',
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.complete({
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'aborted' });
    expect(server.requests).toHaveLength(0);
  });

  it('rejects an invalid baseURL before making a request', async () => {
    const provider = new OpenAiCompatibleProvider({
      baseURL: 'not a url',
      model: 'test-model',
    });

    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ kind: 'config' });
  });
});
