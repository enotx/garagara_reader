import { LlmError } from '@garagara/llm';

/** Maps provider failures to short Chinese messages for the reader UI. */
export function describeLlmError(error: unknown): string {
  if (error instanceof LlmError) {
    if (error.kind === 'timeout') {
      return '请求超时，请重试。';
    }
    if (error.kind === 'network') {
      return '网络不可用，请检查连接后重试。';
    }
    if (error.kind === 'http' && (error.status === 401 || error.status === 403)) {
      return 'API Key 或服务地址无效。';
    }
    if (error.kind === 'invalid_response') {
      return 'AI 返回的内容格式不正确，可以重试。';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : '请求失败，请重试。';
}
