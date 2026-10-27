import type { Sentence } from '@garagara/core';
import type { DictionaryEntry, PhraseMatch } from '@garagara/lang-en';
import { lemmatize } from '@garagara/lang-en';
import { useEffect, useRef, useState } from 'react';

import { loadDictionary } from './dictionary.js';
import { IconX } from './icons';
import type { HitTestResult } from './hit-test.js';
import { phrasesForBlock, tokensForBlock } from './text-analysis.js';

interface CardData {
  loading: boolean;
  available: boolean;
  lemma: string;
  phrase?: PhraseMatch;
  entries: DictionaryEntry[];
}

export function WordCard({
  hit,
  sentence,
  placement,
  onClose,
}: {
  hit: HitTestResult;
  sentence?: Sentence;
  placement: 'top' | 'bottom';
  onClose: () => void;
}) {
  const [data, setData] = useState<CardData>({
    loading: true,
    available: true,
    lemma: hit.token.surface.toLowerCase(),
    entries: [],
  });
  const [expanded, setExpanded] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    cardRef.current?.scrollTo({ top: 0 });
    setData({
      loading: true,
      available: true,
      lemma: hit.token.surface.toLowerCase(),
      entries: [],
    });
    setExpanded(false);
    loadDictionary()
      .then(async (dictionary) => {
        if (!active) {
          return;
        }
        if (!dictionary) {
          setData({
            loading: false,
            available: false,
            lemma: hit.token.surface.toLowerCase(),
            entries: [],
          });
          return;
        }
        const tokens = tokensForBlock(hit.block);
        const lemmas = lemmatize(hit.token, tokens, dictionary);
        const phrase = phrasesForBlock(hit.block, dictionary).find(
          (match) => hit.token.start >= match.start && hit.token.end <= match.end,
        );
        const lemma = phrase?.lemma ?? lemmas[0] ?? hit.token.surface.toLowerCase();
        const candidates = phrase
          ? [phrase.lemma]
          : [...new Set([...lemmas, hit.token.surface.toLowerCase()])];
        const entries: DictionaryEntry[] = [];
        for (const candidate of candidates.slice(0, 4)) {
          entries.push(...(await dictionary.lookup(candidate, 'en', 'zh')));
          if (entries.length > 0) {
            break;
          }
        }
        if (active) {
          setData({
            loading: false,
            available: true,
            lemma,
            ...(phrase ? { phrase } : {}),
            entries,
          });
        }
      })
      .catch(() => {
        if (active) {
          setData({
            loading: false,
            available: false,
            lemma: hit.token.surface.toLowerCase(),
            entries: [],
          });
        }
      });
    return () => {
      active = false;
    };
  }, [hit]);

  const title = data.phrase ? data.phrase.lemma : data.lemma;
  const forms =
    hit.token.surface.toLowerCase() === title.toLowerCase()
      ? data.phrase
        ? '短语'
        : ''
      : `${hit.token.surface} → ${title}${data.phrase ? ' · 短语' : ''}`;

  return (
    <aside
      ref={cardRef}
      className={`word-card ${placement}${expanded ? ' expanded' : ''}`}
      data-word-card
      data-card-title={title}
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
            {data.phrase ? '短语' : '词条'} · {expanded ? '全屏' : '上滑展开'}
          </span>
          <h3>{title}</h3>
          {forms ? <p className="word-forms">{forms}</p> : null}
        </div>
        <button
          type="button"
          className="icon-button word-card-close"
          aria-label="关闭词卡"
          onClick={onClose}
        >
          <IconX size={18} />
        </button>
      </header>

      {sentence ? (
        <blockquote className="word-context">
          {hit.block.text.slice(sentence.start, sentence.end)}
        </blockquote>
      ) : null}

      {data.loading ? <p className="muted word-card-status">正在查词典…</p> : null}
      {!data.loading && !data.available ? (
        <p className="muted word-card-status">词典文件不可用。</p>
      ) : null}
      {!data.loading && data.available && data.entries.length === 0 ? (
        <p className="muted word-card-status">没有找到释义。</p>
      ) : null}
      {data.entries.length > 0 ? (
        <div className="word-entries">
          {data.entries.map((entry, index) => (
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
      ) : null}
    </aside>
  );
}
