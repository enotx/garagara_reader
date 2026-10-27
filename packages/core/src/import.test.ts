import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  compareLocators,
  contentId,
  createLocator,
  importBook,
  importEpub,
  importTxt,
  locatorToSentence,
  progressPercent,
  resolveHref,
  type ImportedBook,
  type Sentence,
} from './index.js';

function readFixture(path: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../../fixtures/${path}`, import.meta.url))),
  );
}

function summary(book: ImportedBook) {
  return {
    bookId: book.bookId,
    title: book.metadata.title,
    author: book.metadata.author,
    lang: book.metadata.lang,
    format: book.metadata.format,
    pipelineVersion: book.pipelineVersion,
    chapters: book.chapters.length,
    blocks: book.chapters.reduce((sum, chapter) => sum + chapter.blocks.length, 0),
    characters: book.chapters.reduce(
      (sum, chapter) => sum + chapter.blocks.reduce((inner, block) => inner + block.text.length, 0),
      0,
    ),
    notes: book.notes.length,
    assets: book.assets.map((asset) => ({
      mime: asset.mime,
      width: asset.width,
      height: asset.height,
    })),
    toc: book.toc.slice(0, 12),
  };
}

describe('epub import', () => {
  it.each([
    ['epub/pride-and-prejudice.epub'],
    ['epub/frankenstein.epub'],
    ['epub/the-time-machine.epub'],
    ['epub/alice.epub'],
    ['epub/the-yellow-wallpaper.epub'],
  ])('imports %s', async (path) => {
    const book = await importEpub(readFixture(path), path.split('/').pop() ?? 'book.epub');
    expect(summary(book)).toMatchSnapshot();
    expect(book.chapters.length).toBeGreaterThan(0);
    expect(
      book.chapters.some((chapter) => chapter.blocks.some((block) => block.text.length > 0)),
    ).toBe(true);
  });

  it('is deterministic for the same bytes', async () => {
    const bytes = readFixture('epub/alice.epub');
    const first = await importEpub(bytes, 'alice.epub');
    const second = await importEpub(bytes, 'renamed.epub');
    expect(second.bookId).toBe(first.bookId);
    expect(second.chapters.map((chapter) => chapter.id)).toEqual(
      first.chapters.map((chapter) => chapter.id),
    );
    expect(await contentId(bytes)).toBe(first.bookId);
  });

  it('maps the messy EPUB structure without losing text', async () => {
    const book = await importEpub(readFixture('epub/messy-structure.epub'), 'messy.epub');
    expect(book.metadata).toEqual({
      title: 'Messy Structure',
      author: 'Fixture Author',
      lang: 'en',
      format: 'epub',
    });
    expect(book.toc).toEqual([
      { title: 'Chapter One', chapterIndex: 0, level: 1 },
      { title: 'A Nested Thought', chapterIndex: 0, level: 2 },
      { title: 'Notes & Pictures', chapterIndex: 1, level: 1 },
    ]);
    expect(book.chapters.map((chapter) => chapter.title)).toEqual([
      'Chapter One',
      'Notes & Pictures',
    ]);

    const first = book.chapters[0];
    expect(first).toBeDefined();
    const blocks = first?.blocks ?? [];
    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'paragraph',
      'quote',
      'paragraph',
      'paragraph',
      'listItem',
      'listItem',
      'paragraph',
      'image',
      'image',
      'table',
      'separator',
    ]);
    expect(blocks.map((block) => block.text)).toEqual([
      'Chapter One',
      'This paragraph has emphasis, strength, and a broken line that continues.',
      'Text with a reference1 and a silly anchor2.',
      'Bare text inside a div with non-breaking space and tail.',
      'Quoted words',
      'Before note two.',
      'After note two.',
      'First item',
      'Second item',
      'Nested target paragraph.',
      '',
      '',
      'Name Value\nalpha 1',
      '',
    ]);

    const emphasis = blocks[1]?.marks.find((mark) => mark.type === 'italic');
    expect(emphasis).toMatchObject({ start: 19, end: 27 });
    const noteMarks = blocks.flatMap((block) =>
      block.marks.filter((mark) => mark.type === 'noteRef'),
    );
    expect(noteMarks.map((mark) => mark.attrs?.noteId?.split(':n')[1])).toEqual(['fn1', 'fn2']);

    expect(book.notes.map((note) => note.text).sort()).toEqual([
      'An endnote in its own section.',
      'First footnote body.',
      'Second footnote body.',
    ]);

    const images = blocks.filter((block) => block.type === 'image');
    expect(images.map((block) => block.image)).toEqual([
      { assetId: expect.stringContaining(':a0'), width: 2, height: 2, alt: 'A dot' },
      { assetId: expect.stringContaining(':a1'), width: 120, height: 30, alt: 'A ribbon' },
    ]);
    expect(book.assets.map((asset) => asset.mime)).toEqual(['image/png', 'image/svg+xml']);

    const allText = book.chapters
      .flatMap((chapter) => chapter.blocks)
      .map((block) => block.text)
      .join(' ');
    expect(allText).toContain('Closing words with entity & ampersand.');
    expect(allText).not.toContain('ignored()');
    expect(allText).not.toContain('evil()');
  });

  it('imports Standard Ebooks footnotes as noteRef marks', async () => {
    const book = await importEpub(readFixture('epub/the-time-machine.epub'), 'time.epub');
    const marks = book.chapters.flatMap((chapter) =>
      chapter.blocks.flatMap((block) => block.marks.filter((mark) => mark.type === 'noteRef')),
    );
    expect(marks.length).toBeGreaterThan(0);
    expect(book.notes.length).toBeGreaterThan(0);
  });
});

describe('txt import', () => {
  it('detects chapters and normalizes paragraphs', async () => {
    const text = [
      'A Book',
      '',
      'CHAPTER I',
      '',
      'First   paragraph',
      'wrapped over two lines.',
      '',
      'CHAPTER II',
      '',
      'The second chapter starts here.',
      '',
      'Last paragraph.',
    ].join('\n');
    const book = await importTxt(new TextEncoder().encode(text), 'sample.txt', {
      title: 'Sample',
      author: 'Author',
    });

    expect(book.metadata).toEqual({
      title: 'Sample',
      author: 'Author',
      lang: 'en',
      format: 'txt',
    });
    expect(book.chapters.map((chapter) => chapter.title)).toEqual([
      '前言',
      'CHAPTER I',
      'CHAPTER II',
    ]);
    expect(book.chapters[1]?.blocks[0]).toMatchObject({
      type: 'heading',
      text: 'CHAPTER I',
    });
    expect(book.chapters[1]?.blocks[1]?.text).toBe('First paragraph wrapped over two lines.');
    expect(book.toc).toHaveLength(3);
  });

  it('falls back to ~5000 character virtual chapters', async () => {
    const paragraph = 'word '.repeat(50).trim();
    const text = Array.from({ length: 120 }, () => paragraph).join('\n\n');
    const book = await importTxt(new TextEncoder().encode(text), 'long.txt');
    expect(book.chapters.length).toBeGreaterThan(1);
    expect(book.chapters.every((chapter) => chapter.title.startsWith('第 '))).toBe(true);
    for (const chapter of book.chapters) {
      const length = chapter.blocks.reduce((sum, block) => sum + block.text.length, 0);
      expect(length).toBeLessThanOrEqual(5000 + paragraph.length);
    }
  });

  it('decodes UTF-8 BOM and UTF-16LE BOM', async () => {
    const utf8 = new TextEncoder().encode('CHAPTER I\n\nHello.');
    const withBom = new Uint8Array(utf8.length + 3);
    withBom.set([0xef, 0xbb, 0xbf]);
    withBom.set(utf8, 3);
    const utf8Book = await importTxt(withBom, 'bom.txt');
    expect(utf8Book.chapters[0]?.blocks[0]?.text).toBe('CHAPTER I');

    const utf16 = new Uint8Array([0xff, 0xfe, 0x43, 0x00, 0x48, 0x00, 0x41, 0x00]);
    const utf16Book = await importTxt(utf16, 'utf16.txt');
    expect(utf16Book.chapters[0]?.blocks[0]?.text).toBe('CHA');
  });

  it('dispatches importBook by extension and ZIP signature', async () => {
    const txt = await importBook(new TextEncoder().encode('hello world'), 'book.txt');
    expect(txt.metadata.format).toBe('txt');

    const epub = await importBook(readFixture('epub/messy-structure.epub'), 'renamed.bin');
    expect(epub.metadata.format).toBe('epub');
  });
});

describe('locator helpers', () => {
  const sentences: Sentence[] = [
    { id: 'b:s0', blockId: 'b', index: 0, start: 0, end: 10 },
    { id: 'b:s1', blockId: 'b', index: 1, start: 11, end: 20 },
  ];

  it('orders locators and finds sentences', () => {
    const bookId = 'book';
    const first = createLocator(bookId, 0, 0, 3);
    const second = createLocator(bookId, 0, 0, 15);
    expect(compareLocators(first, second)).toBeLessThan(0);
    expect(locatorToSentence(sentences, second)?.id).toBe('b:s1');
    expect(locatorToSentence(sentences, createLocator(bookId, 0, 0, 99))?.id).toBe('b:s1');
  });

  it('computes progress by character count', () => {
    const chapters = [
      { blocks: [{ text: '12345' }, { text: '12345' }] },
      { blocks: [{ text: '1234567890' }] },
    ];
    expect(progressPercent(chapters, { chapterIndex: 0, blockIndex: 0, offset: 0 })).toBe(0);
    expect(progressPercent(chapters, { chapterIndex: 1, blockIndex: 0, offset: 5 })).toBe(75);
    expect(progressPercent(chapters, { chapterIndex: 1, blockIndex: 0, offset: 10 })).toBe(100);
  });

  it('resolves relative archive paths safely', () => {
    expect(resolveHref('OEBPS/content.opf', 'Text/ch%201.xhtml')).toBe('OEBPS/Text/ch 1.xhtml');
    expect(resolveHref('OEBPS/content.opf', '../Images/a.png')).toBe('Images/a.png');
    expect(resolveHref('OEBPS/content.opf', '../../escape.png')).toBe('');
  });
});
