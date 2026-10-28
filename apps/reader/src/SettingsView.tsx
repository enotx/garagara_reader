import type { SqliteAdapter } from '@garagara/storage';
import { useState } from 'react';

import { IconChevronLeft, IconSettings } from './icons';
import { testLlmConnection } from './llm.js';
import {
  DEFAULT_LLM_SETTINGS,
  isLlmConfigured,
  writeLlmSettings,
  type DefinitionStrategy,
  type ReaderLlmSettings,
} from './settings.js';

type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; message: string };

type TestStatus =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; reply: string }
  | { state: 'error'; message: string };

const STRATEGIES: Array<{
  value: DefinitionStrategy;
  title: string;
  description: string;
}> = [
  {
    value: 'online-first',
    title: '联网优先',
    description: '先显示词典释义占位，AI 结果返回后作为主显示。',
  },
  {
    value: 'dictionary-first',
    title: '词典优先',
    description: '先显示词典释义；没有匹配时自动请求 AI，随时可手动查询。',
  },
];

function reasonFor(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function SettingsView({
  adapter,
  settings,
  apiKey,
  backLabel,
  onBack,
  onSaved,
}: {
  adapter: SqliteAdapter | undefined;
  settings: ReaderLlmSettings;
  apiKey: string;
  backLabel: string;
  onBack: () => void;
  onSaved: (settings: ReaderLlmSettings, apiKey: string) => void | Promise<void>;
}) {
  const [baseURL, setBaseURL] = useState(settings.baseURL);
  const [model, setModel] = useState(settings.model);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [strategy, setStrategy] = useState<DefinitionStrategy>(settings.strategy);
  const [autoRequest, setAutoRequest] = useState(settings.autoRequest);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: 'idle' });

  const draft: ReaderLlmSettings = { baseURL, model, strategy, autoRequest };

  async function save(): Promise<void> {
    if (!adapter) {
      return;
    }
    if (Boolean(baseURL.trim()) !== Boolean(model.trim())) {
      setSaveStatus({ state: 'error', message: 'Base URL 和模型需要同时填写。' });
      return;
    }
    setSaveStatus({ state: 'saving' });
    try {
      await writeLlmSettings(adapter, draft);
      await onSaved(draft, keyDraft);
      setSaveStatus({ state: 'saved' });
    } catch (error) {
      setSaveStatus({ state: 'error', message: `保存失败：${reasonFor(error)}` });
    }
  }

  async function runTest(): Promise<void> {
    setTestStatus({ state: 'testing' });
    try {
      const reply = await testLlmConnection(draft, keyDraft);
      setTestStatus({ state: 'ok', reply });
    } catch (error) {
      setTestStatus({ state: 'error', message: reasonFor(error) });
    }
  }

  return (
    <main className="app settings">
      <header className="settings-topbar">
        <div className="settings-topbar-inner">
          <button type="button" className="icon-button" aria-label={backLabel} onClick={onBack}>
            <IconChevronLeft size={22} />
          </button>
          <div className="settings-heading">
            <p className="eyebrow">设置</p>
            <h1>阅读与 AI</h1>
          </div>
          <span className="settings-mark" aria-hidden="true">
            <IconSettings size={18} />
          </span>
        </div>
      </header>

      <div className="settings-shell">
        <section className="settings-group" aria-labelledby="settings-ai-title">
          <header className="settings-group-head">
            <div>
              <h2 id="settings-ai-title">AI 服务</h2>
              <p>使用你自己的 OpenAI-compatible 接口。书籍内容只在请求时发送。</p>
            </div>
            <span
              className={`settings-badge${isLlmConfigured(draft) ? ' is-ready' : ''}`}
              aria-live="polite"
            >
              {isLlmConfigured(draft) ? '已配置' : '未配置'}
            </span>
          </header>

          <div className="settings-fields">
            <label className="settings-field">
              <span className="settings-label">Base URL</span>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://api.example.com/v1"
                value={baseURL}
                onChange={(event) => {
                  setBaseURL(event.target.value);
                  setSaveStatus({ state: 'idle' });
                }}
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">模型</span>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="gpt-4o-mini"
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  setSaveStatus({ state: 'idle' });
                }}
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">
                API Key
                <small>{apiKey ? '当前会话已填写' : '可留空（本地服务）'}</small>
              </span>
              <input
                type="password"
                autoComplete="off"
                placeholder="sk-…"
                value={keyDraft}
                onChange={(event) => {
                  setKeyDraft(event.target.value);
                  setSaveStatus({ state: 'idle' });
                }}
              />
            </label>
          </div>

          <p className="settings-hint">
            网页开发版的 API Key 只保存在当前页面内存里，刷新或关闭后需要重新填写；iOS 版会写入
            Keychain，不写入数据库或日志。
          </p>

          <div className="settings-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => void save()}
              disabled={!adapter || saveStatus.state === 'saving'}
            >
              {saveStatus.state === 'saving' ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void runTest()}
              disabled={testStatus.state === 'testing'}
            >
              {testStatus.state === 'testing' ? '测试中…' : '测试连接'}
            </button>
          </div>

          {saveStatus.state === 'saved' ? (
            <p className="settings-feedback is-success" role="status">
              设置已保存。
            </p>
          ) : null}
          {saveStatus.state === 'error' ? (
            <p className="settings-feedback is-error" role="status">
              {saveStatus.message}
            </p>
          ) : null}
          {testStatus.state === 'ok' ? (
            <p className="settings-feedback is-success" role="status">
              连接成功：{testStatus.reply}
            </p>
          ) : null}
          {testStatus.state === 'error' ? (
            <p className="settings-feedback is-error" role="status">
              连接失败：{testStatus.message}
            </p>
          ) : null}
        </section>

        <section className="settings-group" aria-labelledby="settings-source-title">
          <header className="settings-group-head">
            <div>
              <h2 id="settings-source-title">释义来源</h2>
              <p>决定词卡先显示词典还是 AI 结果。</p>
            </div>
          </header>

          <div
            className="settings-options"
            role="radiogroup"
            aria-labelledby="settings-source-title"
          >
            {STRATEGIES.map((item) => (
              <label
                key={item.value}
                className={`settings-option${strategy === item.value ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="definition-strategy"
                  value={item.value}
                  checked={strategy === item.value}
                  onChange={() => {
                    setStrategy(item.value);
                    setSaveStatus({ state: 'idle' });
                  }}
                />
                <span className="settings-option-copy">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="settings-switch">
            <span>
              <strong>点词时自动请求本句含义</strong>
              <span>关闭后，词卡里只显示按钮，需要手动查询。</span>
            </span>
            <input
              type="checkbox"
              checked={autoRequest}
              onChange={(event) => {
                setAutoRequest(event.target.checked);
                setSaveStatus({ state: 'idle' });
              }}
            />
          </label>
        </section>

        <section className="settings-group settings-privacy" aria-label="隐私说明">
          <h2>隐私</h2>
          <p>
            API Key 不写入 SQLite、不打印到日志。请求只发往你填写的 Base
            URL，只包含当前句子和目标词。
          </p>
          <p className="settings-version">
            默认值参考 Spec §14：联网优先，自动请求，解释语言中文。
          </p>
          <button
            type="button"
            className="settings-reset"
            onClick={() => {
              setBaseURL(DEFAULT_LLM_SETTINGS.baseURL);
              setModel(DEFAULT_LLM_SETTINGS.model);
              setStrategy(DEFAULT_LLM_SETTINGS.strategy);
              setAutoRequest(DEFAULT_LLM_SETTINGS.autoRequest);
              setSaveStatus({ state: 'idle' });
            }}
          >
            恢复默认释义设置
          </button>
        </section>
      </div>
    </main>
  );
}
