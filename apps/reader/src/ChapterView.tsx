import type { Block, Mark, Sentence } from '@garagara/core';
import type { StoredChapter } from '@garagara/storage';
import { useMemo } from 'react';

import { buildFragments } from './render-fragments.js';

function markClass(mark: Mark): string {
  return `mark mark-${mark.type}`;
}

function FragmentText({
  block,
  sentenceId,
  fragment,
}: {
  block: Block;
  sentenceId: string | undefined;
  fragment: ReturnType<typeof buildFragments>[number];
}) {
  const note = fragment.marks.find((mark) => mark.type === 'noteRef')?.attrs?.noteId;
  return (
    <span
      className={fragment.marks.length > 0 ? fragment.marks.map(markClass).join(' ') : undefined}
      data-block={block.id}
      data-start={fragment.start}
      data-end={fragment.end}
      data-sentence={sentenceId}
      data-note-id={note}
    >
      {fragment.text}
    </span>
  );
}

function BlockView({ block, sentences }: { block: Block; sentences: Sentence[] }) {
  const fragments = buildFragments(block.text, block.marks, sentences);
  const children = fragments.map((fragment) => (
    <FragmentText
      key={`${block.id}:${fragment.start}`}
      block={block}
      sentenceId={fragment.sentenceId}
      fragment={fragment}
    />
  ));
  if (block.type === 'image') {
    return (
      <figure
        className="block image"
        data-block-id={block.id}
        data-block-type={block.type}
        data-text={block.text}
      >
        <div
          className="image-placeholder"
          role="img"
          aria-label={block.image?.alt || '图片'}
          style={{ aspectRatio: `${block.image?.width || 1} / ${block.image?.height || 1}` }}
        ></div>
      </figure>
    );
  }
  if (block.type === 'separator') {
    return (
      <hr
        className="block separator"
        data-block-id={block.id}
        data-block-type={block.type}
        data-text={block.text}
      />
    );
  }

  const common = {
    'data-block-id': block.id,
    'data-block-type': block.type,
    'data-text': block.text,
  };

  switch (block.type) {
    case 'heading':
      return (
        <h3 className="block heading" {...common}>
          {children}
        </h3>
      );
    case 'quote':
      return (
        <blockquote className="block quote" {...common}>
          {children}
        </blockquote>
      );
    case 'listItem':
      return (
        <p className="block listItem" {...common}>
          {children}
        </p>
      );
    case 'table':
      return (
        <pre className="block table" {...common}>
          {children}
        </pre>
      );
    default:
      return (
        <p className="block paragraph" {...common}>
          {children}
        </p>
      );
  }
}

export function ChapterView({ chapter }: { chapter: StoredChapter }) {
  const byBlock = useMemo(() => {
    const map = new Map<string, Sentence[]>();
    for (const sentence of chapter.sentences) {
      const list = map.get(sentence.blockId) ?? [];
      list.push(sentence);
      map.set(sentence.blockId, list);
    }
    return map;
  }, [chapter.sentences]);

  return (
    <article className="chapter-view" data-chapter={chapter.id}>
      {chapter.blocks.map((block) => (
        <BlockView key={block.id} block={block} sentences={byBlock.get(block.id) ?? []} />
      ))}
    </article>
  );
}
