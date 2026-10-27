import { blockId, chapterId, contentId } from './ids.js';
import { PIPELINE_VERSION } from './types.js';
import type { Block, Chapter, ImportedBook, TocEntry } from './types.js';

const CHAPTER_HEADING_PATTERNS: readonly RegExp[] = [
  /^(chapter|part|book)\s+\S+/i,
  /^(prologue|epilogue|introduction|preface|foreword|afterword)\b/i,
  /^第\s*[0-9一二三四五六七八九十百千零两]+\s*[章回节卷]/,
  /^(chapter|part)\s+[IVXLCDM]+\.?$/i,
];

export interface TxtImportOptions {
  title?: string;
  author?: string;
  lang?: string;
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gbk').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

export function normalizeParagraph(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isChapterHeading(paragraph: string): boolean {
  if (paragraph.length > 80) {
    return false;
  }
  return CHAPTER_HEADING_PATTERNS.some((pattern) => pattern.test(paragraph));
}

function makeBlocks(
  bookId: string,
  chapterIndex: number,
  paragraphs: readonly string[],
  heading: boolean,
): Block[] {
  return paragraphs.map((text, index) => ({
    id: blockId(bookId, chapterIndex, index),
    chapterIndex,
    index,
    type: heading && index === 0 ? 'heading' : 'paragraph',
    text,
    marks: [],
  }));
}

function splitVirtualChapters(paragraphs: readonly string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (current.length > 0 && length + paragraph.length > 5000) {
      groups.push(current);
      current = [];
      length = 0;
    }
    current.push(paragraph);
    length += paragraph.length;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

/**
 * Imports a plain-text book. Paragraphs are separated by blank lines and
 * whitespace is collapsed. Chapter headings are detected by regex; if none are
 * found, paragraphs are grouped into ~5000-character virtual chapters.
 */
export async function importTxt(
  bytes: Uint8Array,
  fileName = 'book.txt',
  options: TxtImportOptions = {},
): Promise<ImportedBook> {
  const raw = decodeText(bytes).replace(/\r\n?/g, '\n');
  const paragraphs = raw
    .split(/\n[ \t]*\n+/)
    .map(normalizeParagraph)
    .filter(Boolean);

  const bookId = await contentId(bytes);
  const fallbackTitle = fileName.replace(/\.[^.]+$/, '') || 'Untitled';
  const hasHeadings = paragraphs.some(isChapterHeading);
  const chapterGroups: { title: string; paragraphs: string[]; heading: boolean }[] = [];

  if (hasHeadings) {
    let current: { title: string; paragraphs: string[]; heading: boolean } = {
      title: '前言',
      paragraphs: [],
      heading: false,
    };
    for (const paragraph of paragraphs) {
      if (isChapterHeading(paragraph)) {
        if (current.paragraphs.length > 0) {
          chapterGroups.push(current);
        }
        current = { title: paragraph, paragraphs: [paragraph], heading: true };
      } else {
        current.paragraphs.push(paragraph);
      }
    }
    if (current.paragraphs.length > 0) {
      chapterGroups.push(current);
    }
  } else {
    splitVirtualChapters(paragraphs).forEach((group, index) => {
      chapterGroups.push({
        title: `第 ${index + 1} 部分`,
        paragraphs: group,
        heading: false,
      });
    });
  }

  if (chapterGroups.length === 0) {
    chapterGroups.push({ title: '第 1 部分', paragraphs: [], heading: false });
  }

  const chapters: Chapter[] = chapterGroups.map((group, index) => ({
    id: chapterId(bookId, index),
    index,
    title: group.title,
    tocLevel: 1,
    blocks: makeBlocks(bookId, index, group.paragraphs, group.heading),
  }));

  const toc: TocEntry[] = chapters.map((chapter) => ({
    title: chapter.title,
    chapterIndex: chapter.index,
    level: 1,
  }));

  return {
    bookId,
    metadata: {
      title: options.title || fallbackTitle,
      author: options.author || '',
      lang: options.lang || 'en',
      format: 'txt',
    },
    pipelineVersion: PIPELINE_VERSION,
    chapters,
    notes: [],
    assets: [],
    toc,
  };
}
