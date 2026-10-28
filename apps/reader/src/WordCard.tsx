import type { Sentence } from '@garagara/core';
import type { DictionaryEntry, PhraseMatch } from '@garagara/lang-en';
import { lemmatize } from '@garagara/lang-en';
import { LlmError } from '@garagara/llm';
import type { SqliteAdapter, VocabEntry } from '@garagara/storage';
import { addVocab, findVocab, removeVocab } from '@garagara/storage';
import type { WordInContextResult } from '@garagara/llm';
import { useEffect, useRef, useState } from 'react';

import { loadDictionary } from './dictionary.js';
import { IconChevronRight, IconX } from './icons';
import type { HitTestResult } from './hit-test.js';
import { describeLlmError } from './llm-errors.js';
import { isLlmConfigured, type ReaderLlmSettings } from './settings.js';
import { phrasesForBlock, tokensForBlock } from './text-analysis.js';
import { loadWordContext, type LlmRuntime, type WordContextTarget } from './llm.js';

interface CardData {
  hitKey: string;
  loading: boolean;
  available: boolean;
  lemma: string;
  wordLemma: string;
  phrase?: PhraseMatch;
  entries: DictionaryEntry[];
  wordEntries: DictionaryEntry[];
}

type ContextView =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: WordInContextResult; source: 'cache' | 'llm' }
  | { status: 'offline'; message: string }
  | { status: 'not-configured' }
  | { status: 'error'; message: string };

function cardKey(hit: HitTestResult): string {
  return `${hit.block.id}:${hit.token.start}`;
}

function contextSettings(runtime: LlmRuntime | undefined): ReaderLlmSettings | undefined {
  return runtime?.settings;
}

export function WordCard({
  hit,
  sentence,
  llm,
  adapter,
  bookId,
  placement,
  onClose,
  onOpenSettings,
}: {
  hit: HitTestResult;
  sentence?: Sentence;
  llm?: LlmRuntime;
  adapter?: SqliteAdapter;
  bookId?: string;
  placement: 'top' | 'bottom';
  onClose: () => void;
  onOpenSettings?: () => void;
}) {
  const initialKey = cardKey(hit);
  const [data, setData] = useState<CardData>({
    hitKey: initialKey,
    loading: true,
    available: true,
    lemma: hit.token.surface.toLowerCase(),
    wordLemma: hit.token.surface.toLowerCase(),
    entries: [],
    wordEntries: [],
  });
  const [onlyWord, setOnlyWord] = useState(false);
  const [vocabEntry, setVocabEntry] = useState<VocabEntry | null>(null);
  const [vocabBusy, setVocabBusy] = useState(false);
  const [context, setContext] = useState<ContextView>({ status: 'idle' });
  const [expanded, setExpanded] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const contextController = useRef<AbortController | null>(null);
  const hitKey = cardKey(hit);

  const sentenceText = sentence
    ? hit.block.text.slice(sentence.start, sentence.end)
    : hit.block.text;
  const targetStart = hit.token.start - (sentence?.start ?? 0);
  const targetEnd = hit.token.end - (sentence?.start ?? 0);
  const target: WordContextTarget = { sentence: sentenceText, start: targetStart, end: targetEnd };

  useEffect(() => {
    let active = true;
    cardRef.current?.scrollTo({ top: 0 });
    setData({
      hitKey,
      loading: true,
      available: true,
      lemma: hit.token.surface.toLowerCase(),
      wordLemma: hit.token.surface.toLowerCase(),
      entries: [],
      wordEntries: [],
    });
    setOnlyWord(false);
    setExpanded(false);
    loadDictionary()
      .then(async (dictionary) => {
        if (!active) {
          return;
        }
        if (!dictionary) {
          setData({
            hitKey,
            loading: false,
            available: false,
            lemma: hit.token.surface.toLowerCase(),
            wordLemma: hit.token.surface.toLowerCase(),
            entries: [],
            wordEntries: [],
          });
          return;
        }
        const tokens = tokensForBlock(hit.block);
        const lemmas = lemmatize(hit.token, tokens, dictionary);
        const phrase = phrasesForBlock(hit.block, dictionary).find(
          (match) => hit.token.start >= match.start && hit.token.end <= match.end,
        );
        const wordLemma = lemmas[0] ?? hit.token.surface.toLowerCase();
        const lemma = phrase?.lemma ?? wordLemma;
        const lookup = async (candidates: string[]): Promise<DictionaryEntry[]> => {
          const found: DictionaryEntry[] = [];
          for (const candidate of candidates.slice(0, 4)) {
            found.push(...(await dictionary.lookup(candidate, 'en', 'zh')));
            if (found.length > 0) {
              break;
            }
          }
          return found;
        };
        const wordEntries = await lookup([
          ...new Set([...lemmas, hit.token.surface.toLowerCase()]),
        ]);
        const phraseEntries = phrase ? await lookup([phrase.lemma]) : [];
        const entries = phrase ? phraseEntries : wordEntries;
        if (active) {
          setData({
            hitKey,
            loading: false,
            available: true,
            lemma,
            wordLemma,
            ...(phrase ? { phrase } : {}),
            entries,
            wordEntries,
          });
        }
      })
      .catch(() => {
        if (active) {
          setData({
            hitKey,
            loading: false,
            available: false,
            lemma: hit.token.surface.toLowerCase(),
            wordLemma: hit.token.surface.toLowerCase(),
            entries: [],
            wordEntries: [],
          });
        }
      });
    return () => {
      active = false;
    };
  }, [hit, hitKey]);

  async function runContext(): Promise<void> {
    if (!llm || !isLlmConfigured(llm.settings)) {
      setContext({ status: 'not-configured' });
      return;
    }
    contextController.current?.abort();
    const controller = new AbortController();
    contextController.current = controller;
    setContext({ status: 'loading' });
    try {
      const outcome = await loadWordContext(llm, target, {
        allowNetwork: typeof navigator === 'undefined' ? true : navigator.onLine,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      if (outcome.status === 'ready') {
        setContext({ status: 'ready', result: outcome.result, source: outcome.source });
      } else {
        setContext({ status: 'offline', message: outcome.message });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof LlmError && error.kind === 'aborted') {
        return;
      }
      setContext({ status: 'error', message: describeLlmError(error) });
    }
  }

  useEffect(() => {
    contextController.current?.abort();
    setContext({ status: 'idle' });
    const settings = contextSettings(llm);
    if (!settings || !isLlmConfigured(settings)) {
      setContext({ status: 'not-configured' });
      return;
    }
    if (data.hitKey !== hitKey || data.loading) {
      return;
    }
    if (!settings.autoRequest) {
      return;
    }
    if (settings.strategy === 'dictionary-first' && data.entries.length > 0) {
      return;
    }
    void runContext();
    return () => {
      contextController.current?.abort();
    };
    // runContext intentionally reads the current hit and settings; the
    // primitive deps below still rerun the effect when either changes.
  }, [
    hitKey,
    data.hitKey,
    data.loading,
    data.entries.length,
    llm?.settings.baseURL,
    llm?.settings.model,
    llm?.settings.strategy,
    llm?.settings.autoRequest,
    llm?.apiKey,
  ]);

  useEffect(
    () => () => {
      contextController.current?.abort();
    },
    [],
  );

  const showWordOnly = onlyWord && Boolean(data.phrase);
  const title = showWordOnly ? data.wordLemma : data.lemma;
  const entriesToShow = showWordOnly ? data.wordEntries : data.entries;
  const forms = showWordOnly
    ? hit.token.surface.toLowerCase() === data.wordLemma.toLowerCase()
      ? ''
      : `${hit.token.surface} → ${data.wordLemma}`
    : hit.token.surface.toLowerCase() === title.toLowerCase()
      ? data.phrase
        ? '短语'
        : ''
      : `${hit.token.surface} → ${title}${data.phrase ? ' · 短语' : ''}`;
  const settings = contextSettings(llm);
  const configured = settings ? isLlmConfigured(settings) : false;
  const showManualButton =
    context.status === 'idle' || context.status === 'error' || context.status === 'offline';

  useEffect(() => {
    let active = true;
    if (!adapter) {
      setVocabEntry(null);
      return;
    }
    findVocab(adapter, title, 'en')
      .then((row) => {
        if (active) {
          setVocabEntry(row ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setVocabEntry(null);
        }
      });
    return () => {
      active = false;
    };
  }, [adapter, title]);

  async function toggleVocab(): Promise<void> {
    if (!adapter || !bookId) {
      return;
    }
    setVocabBusy(true);
    try {
      if (vocabEntry) {
        await removeVocab(adapter, vocabEntry.id);
        setVocabEntry(null);
      } else {
        await addVocab(adapter, {
          lemma: title,
          surface: hit.token.surface,
          lang: 'en',
          sentenceText,
          locator: {
            bookId,
            chapterIndex: hit.block.chapterIndex,
            blockIndex: hit.block.index,
            offset: hit.token.start,
          },
          ...(context.status === 'ready' ? { meaning: context.result.meaning } : {}),
          ...(context.status === 'ready' ? { source: context.source } : {}),
        });
        setVocabEntry((await findVocab(adapter, title, 'en')) ?? null);
      }
    } catch {
      // The card still works; a failed write simply leaves the star unchanged.
    } finally {
      setVocabBusy(false);
    }
  }

  return (
    <aside
      ref={cardRef}
      className={`word-card ${placement}${expanded ? ' expanded' : ''}`}
      data-word-card
      data-card-title={title}
      data-context-status={context.status}
      data-expanded={expanded}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('button, select, input, a')) {
          return;
        }
        pointerStart.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (start === null) {
          return;
        }
        const delta = event.clientY - start;
        if (delta < -40) {
          setExpanded(true);
        } else if (delta > 40) {
          onClose();
        }
      }}
    >
      <div className="word-card-handle" aria-hidden="true" />
      <header className="word-card-header">
        <div className="word-card-titleblock">
          <span className="word-card-kicker">
            {data.phrase && !showWordOnly ? '短语' : '词条'} · {expanded ? '全屏' : '上滑展开'}
          </span>
          <h3>{title}</h3>
          {forms ? <p className="word-forms">{forms}</p> : null}
        </div>
        <div className="word-card-header-actions">
          {adapter && bookId ? (
            <button
              type="button"
              className={`word-star${vocabEntry ? ' is-collected' : ''}`}
              aria-label={vocabEntry ? '移出生词本' : '加入生词本'}
              aria-pressed={Boolean(vocabEntry)}
              disabled={vocabBusy}
              onClick={() => void toggleVocab()}
            >
              {vocabEntry ? '★' : '☆'}
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button word-card-close"
            aria-label="关闭词卡"
            onClick={onClose}
          >
            <IconX size={18} />
          </button>
        </div>
      </header>

      <section className="word-context-ai" aria-label="本句含义" data-word-context>
        <div className="word-section-head">
          <h4>本句含义</h4>
          {context.status === 'ready' ? (
            <span className="word-source-badge" data-context-source={context.source}>
              {context.source === 'cache' ? '缓存' : 'AI'}
            </span>
          ) : null}
        </div>

        {context.status === 'loading' ? (
          <p className="word-context-loading" role="status">
            正在结合上下文理解…
          </p>
        ) : null}

        {context.status === 'ready' ? (
          <>
            <p className="word-context-meaning" data-context-meaning>
              {context.result.meaning}
            </p>
            {context.result.pos ? <p className="word-context-pos">{context.result.pos}</p> : null}
            {context.result.phrase ? (
              <p className="word-context-phrase">
                {context.result.phrase.text}
                <span> · {context.result.phrase.lemma}</span>
              </p>
            ) : null}
          </>
        ) : null}

        {context.status === 'offline' ? (
          <p className="word-context-message">{context.message}仍可使用下方词典释义。</p>
        ) : null}

        {context.status === 'error' ? (
          <p className="word-context-message is-error">{context.message}</p>
        ) : null}

        {context.status === 'not-configured' ? (
          <p className="word-context-message">
            尚未配置 AI 服务。
            {onOpenSettings ? (
              <button type="button" className="word-inline-action" onClick={onOpenSettings}>
                去设置
                <IconChevronRight size={14} />
              </button>
            ) : null}
          </p>
        ) : null}

        {showManualButton ? (
          <button
            type="button"
            className="word-context-button"
            onClick={() => void runContext()}
            disabled={!configured}
          >
            {context.status === 'error' || context.status === 'offline'
              ? '重试本句含义'
              : '查询本句含义'}
          </button>
        ) : null}
      </section>

      <div className="word-card-actions">
        {data.phrase ? (
          <button
            type="button"
            className="word-card-action"
            onClick={() => setOnlyWord((value) => !value)}
          >
            {showWordOnly ? '看短语' : `只看 ${hit.token.surface}`}
          </button>
        ) : null}
        {onOpenSettings ? (
          <button type="button" className="word-card-action" onClick={onOpenSettings}>
            AI 设置
          </button>
        ) : null}
      </div>

      {data.loading ? <p className="muted word-card-status">正在查词典…</p> : null}
      {!data.loading && !data.available ? (
        <p className="muted word-card-status">词典文件不可用。</p>
      ) : null}
      {!data.loading && data.available && entriesToShow.length === 0 ? (
        <p className="muted word-card-status">没有找到释义。</p>
      ) : null}
      {entriesToShow.length > 0 ? (
        <section className="word-dictionary" aria-label="词典释义">
          <div className="word-section-head">
            <h4>词典</h4>
          </div>
          <div className="word-entries">
            {entriesToShow.map((entry, index) => (
              <article key={`${entry.headword}:${index}`} className="word-entry">
                <h4>
                  {entry.headword}
                  {entry.pos ? <span className="word-pos">{entry.pos}</span> : null}
                </h4>
                <p className="word-translation">{entry.translation}</p>
                {entry.bnc ? <p className="word-rank">BNC {entry.bnc}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
