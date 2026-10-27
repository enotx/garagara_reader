export const PIPELINE_VERSION = 1;

export type BlockType =
  'heading' | 'paragraph' | 'quote' | 'listItem' | 'image' | 'separator' | 'table';

export type MarkType = 'italic' | 'bold' | 'sup' | 'sub' | 'noteRef';

export interface Mark {
  /** Inclusive start offset in the owning text, UTF-16 code units. */
  start: number;
  /** Exclusive end offset in the owning text, UTF-16 code units. */
  end: number;
  type: MarkType;
  attrs?: { noteId?: string };
}

export interface ImageInfo {
  assetId: string;
  width: number;
  height: number;
  alt?: string;
}

export interface Block {
  id: string;
  chapterIndex: number;
  index: number;
  type: BlockType;
  /** Pure text. Every offset in marks/sentences/chunks is relative to this string. */
  text: string;
  marks: Mark[];
  image?: ImageInfo;
}

export interface Note {
  id: string;
  text: string;
  marks: Mark[];
}

export interface Asset {
  id: string;
  mime: string;
  /** Path inside the source archive. */
  path: string;
  width: number;
  height: number;
  data: Uint8Array;
}

export interface TocEntry {
  title: string;
  chapterIndex: number;
  level: number;
}

export interface Chapter {
  id: string;
  index: number;
  title: string;
  tocLevel: number;
  blocks: Block[];
}

export interface BookMetadata {
  title: string;
  author: string;
  lang: string;
  format: 'epub' | 'txt';
}

export interface ImportedBook {
  bookId: string;
  metadata: BookMetadata;
  pipelineVersion: number;
  chapters: Chapter[];
  notes: Note[];
  assets: Asset[];
  toc: TocEntry[];
}

export interface Sentence {
  id: string;
  blockId: string;
  index: number;
  /** Inclusive start offset in the block text. */
  start: number;
  /** Exclusive end offset in the block text. */
  end: number;
}

export interface Chunk {
  sentenceId: string;
  index: number;
  /** Inclusive start offset in the block text. */
  start: number;
  /** Exclusive end offset in the block text. */
  end: number;
}

export interface Locator {
  bookId: string;
  chapterIndex: number;
  blockIndex: number;
  /** Offset in the block text. */
  offset: number;
}
