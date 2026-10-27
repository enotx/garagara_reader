import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

import { assetId, blockId, noteId } from '../ids.js';
import { fileExtension, resolveHref, splitHref } from '../path.js';
import type { Asset, Block, BlockType, Mark, MarkType, Note } from '../types.js';
import type { EpubArchive } from './archive.js';
import type { ManifestItem } from './opf.js';
import { collapseWhitespace, elementText } from './toc.js';

type P5Node = DefaultTreeAdapterTypes.Node;
type P5Element = DefaultTreeAdapterTypes.Element;
type P5TextNode = DefaultTreeAdapterTypes.TextNode;

const SKIP_TAGS = new Set([
  'script',
  'style',
  'head',
  'title',
  'meta',
  'link',
  'base',
  'noscript',
  'template',
]);

const CONTAINER_TAGS = new Set([
  'html',
  'body',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'nav',
  'figure',
  'figcaption',
  'aside',
  'ul',
  'ol',
  'dl',
  'dt',
  'dd',
]);

const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'li',
  'pre',
  'div',
]);

function isElement(node: P5Node): node is P5Element {
  return 'tagName' in node;
}

function isTextNode(node: P5Node): node is P5TextNode {
  return node.nodeName === '#text';
}

function attrValue(element: P5Element, name: string): string {
  return element.attrs.find((item) => item.name === name)?.value ?? '';
}

function hasTypeOrRole(element: P5Element, type: string, role: string): boolean {
  const types = attrValue(element, 'epub:type').split(/\s+/);
  const roles = attrValue(element, 'role').split(/\s+/);
  return types.includes(type) || roles.includes(role);
}

function isFootnoteElement(element: P5Element): boolean {
  return (
    hasTypeOrRole(element, 'footnote', 'doc-footnote') ||
    hasTypeOrRole(element, 'endnote', 'doc-endnote')
  );
}

function isNoteReference(element: P5Element): boolean {
  if (element.tagName !== 'a') {
    return false;
  }
  if (hasTypeOrRole(element, 'noteref', 'doc-noteref')) {
    return true;
  }
  const href = attrValue(element, 'href');
  if (!href.includes('#')) {
    return false;
  }
  const label = collapseWhitespace(elementText(element));
  const parentIsSup =
    element.parentNode !== null &&
    isElement(element.parentNode) &&
    element.parentNode.tagName === 'sup';
  return parentIsSup || /^[\d*†‡§¶]+$/.test(label);
}

function markTypeFor(tagName: string): MarkType | undefined {
  switch (tagName) {
    case 'em':
    case 'i':
      return 'italic';
    case 'strong':
    case 'b':
      return 'bold';
    case 'sup':
      return 'sup';
    case 'sub':
      return 'sub';
    default:
      return undefined;
  }
}

function typeForBlockTag(tagName: string): BlockType {
  if (/^h[1-6]$/.test(tagName)) {
    return 'heading';
  }
  switch (tagName) {
    case 'blockquote':
      return 'quote';
    case 'li':
      return 'listItem';
    default:
      return 'paragraph';
  }
}

function findDescendant(element: P5Element, tagName: string): P5Element | undefined {
  for (const child of element.childNodes) {
    if (!isElement(child)) {
      continue;
    }
    if (child.tagName === tagName) {
      return child;
    }
    const found = findDescendant(child, tagName);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function hasBlockDescendant(element: P5Element): boolean {
  for (const child of element.childNodes) {
    if (!isElement(child)) {
      continue;
    }
    if (BLOCK_TAGS.has(child.tagName) || child.tagName === 'table' || child.tagName === 'hr') {
      return true;
    }
    if (child.tagName === 'img' || child.tagName === 'svg') {
      return true;
    }
    if (CONTAINER_TAGS.has(child.tagName) && hasBlockDescendant(child)) {
      return true;
    }
  }
  return false;
}

class InlineBuilder {
  private raw = '';
  private marks: Mark[] = [];

  get length(): number {
    return this.raw.length;
  }

  append(value: string): void {
    for (const char of value) {
      if (/\s/u.test(char)) {
        if (!this.raw.endsWith(' ')) {
          this.raw += ' ';
        }
      } else {
        this.raw += char;
      }
    }
  }

  addMark(type: MarkType, start: number, end: number, attrs?: { noteId?: string }): void {
    if (end <= start) {
      return;
    }
    this.marks.push(attrs ? { start, end, type, attrs } : { start, end, type });
  }

  reset(): void {
    this.raw = '';
    this.marks = [];
  }

  finish(): { text: string; marks: Mark[] } {
    let start = 0;
    let end = this.raw.length;
    while (start < end && this.raw[start] === ' ') {
      start += 1;
    }
    while (end > start && this.raw[end - 1] === ' ') {
      end -= 1;
    }
    const text = this.raw.slice(start, end);
    const marks: Mark[] = [];
    for (const mark of this.marks) {
      const markStart = Math.max(0, mark.start - start);
      const markEnd = Math.min(text.length, mark.end - start);
      if (markEnd > markStart) {
        marks.push({ ...mark, start: markStart, end: markEnd });
      }
    }
    return { text, marks };
  }
}

interface ExtractContext {
  bookId: string;
  chapterIndex: number;
  chapterPath: string;
  archive: EpubArchive;
  manifestByPath: ReadonlyMap<string, ManifestItem>;
  assets: Asset[];
  assetIdByPath: Map<string, string>;
  notes: Map<string, Note>;
}

interface ImageDimensions {
  width: number;
  height: number;
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

function toNumber(value: string): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)/.exec(value);
  return match ? Number(match[1]) : undefined;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  );
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset + 1] ?? 0) << 8) | (bytes[offset] ?? 0);
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    const length = readUint16BE(bytes, offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) };
    }
    offset += 2 + Math.max(length, 2);
  }
  return undefined;
}

function svgDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  const text = new TextDecoder('utf-8').decode(bytes);
  const width = /\swidth\s*=\s*["']([^"']+)["']/.exec(text)?.[1];
  const height = /\sheight\s*=\s*["']([^"']+)["']/.exec(text)?.[1];
  if (width && height) {
    const parsedWidth = toNumber(width);
    const parsedHeight = toNumber(height);
    if (parsedWidth !== undefined && parsedHeight !== undefined) {
      return { width: parsedWidth, height: parsedHeight };
    }
  }
  const viewBox = /\sviewBox\s*=\s*["']([^"']+)["']/.exec(text)?.[1];
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const boxWidth = parts[2];
    const boxHeight = parts[3];
    if (boxWidth !== undefined && boxHeight !== undefined) {
      return { width: boxWidth, height: boxHeight };
    }
  }
  return undefined;
}

function sniffDimensions(bytes: Uint8Array, mime: string): ImageDimensions | undefined {
  if (mime === 'image/png' && bytes.length >= 24) {
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }
  if (mime === 'image/gif' && bytes.length >= 10) {
    return { width: readUint16LE(bytes, 6), height: readUint16LE(bytes, 8) };
  }
  if (mime === 'image/jpeg') {
    return jpegDimensions(bytes);
  }
  if (mime === 'image/svg+xml') {
    return svgDimensions(bytes);
  }
  return undefined;
}

class ChapterExtractor {
  private readonly blocks: Block[] = [];
  private readonly builder = new InlineBuilder();

  constructor(private readonly ctx: ExtractContext) {}

  extract(document: P5Node): Block[] {
    const body = this.findBody(document);
    if (body) {
      this.walkBlocks(body);
    }
    return this.blocks;
  }

  private findBody(node: P5Node): P5Element | undefined {
    if (isElement(node) && node.tagName === 'body') {
      return node;
    }
    if (!('childNodes' in node)) {
      return undefined;
    }
    for (const child of node.childNodes) {
      const found = this.findBody(child);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private emit(type: BlockType): void {
    const finished = this.builder.finish();
    this.builder.reset();
    if (!finished.text && type !== 'separator') {
      return;
    }
    const index = this.blocks.length;
    this.blocks.push({
      id: blockId(this.ctx.bookId, this.ctx.chapterIndex, index),
      chapterIndex: this.ctx.chapterIndex,
      index,
      type,
      text: finished.text,
      marks: finished.marks,
    });
  }

  private emitRaw(type: BlockType, text: string): void {
    if (!text) {
      return;
    }
    const index = this.blocks.length;
    this.blocks.push({
      id: blockId(this.ctx.bookId, this.ctx.chapterIndex, index),
      chapterIndex: this.ctx.chapterIndex,
      index,
      type,
      text,
      marks: [],
    });
  }

  private walkBlocks(parent: P5Element): void {
    let activeType: BlockType = 'paragraph';
    let active = false;

    const flush = (): void => {
      if (active) {
        this.emit(activeType);
        active = false;
      }
    };
    const ensure = (type: BlockType): void => {
      if (!active) {
        active = true;
        activeType = type;
      }
    };

    for (const child of parent.childNodes) {
      if (isTextNode(child)) {
        if (!child.value.trim()) {
          continue;
        }
        ensure('paragraph');
        this.builder.append(child.value);
        continue;
      }
      if (!isElement(child)) {
        continue;
      }
      const tag = child.tagName;
      if (SKIP_TAGS.has(tag)) {
        continue;
      }
      if (isFootnoteElement(child)) {
        this.collectNote(child);
        continue;
      }
      if (tag === 'img') {
        flush();
        this.emitImage(child);
        continue;
      }
      if (tag === 'svg') {
        flush();
        const imageElement = findDescendant(child, 'image');
        if (imageElement) {
          this.emitImage(imageElement, child);
        }
        continue;
      }
      if (tag === 'hr') {
        flush();
        this.emit('separator');
        continue;
      }
      if (tag === 'table') {
        flush();
        this.emitTable(child);
        continue;
      }
      if (tag === 'div' || CONTAINER_TAGS.has(tag)) {
        if (hasBlockDescendant(child)) {
          flush();
          this.walkBlocks(child);
          continue;
        }
        ensure('paragraph');
        this.appendInlineChildren(child, () => {
          this.emit('paragraph');
        });
        continue;
      }
      if (BLOCK_TAGS.has(tag)) {
        flush();
        this.emitInlineBlock(child, typeForBlockTag(tag));
        continue;
      }
      ensure('paragraph');
      this.appendInlineChildren(child, () => {
        this.emit('paragraph');
      });
    }
    flush();
  }

  private emitInlineBlock(element: P5Element, type: BlockType): void {
    this.appendInlineChildren(element, () => {
      this.emit(type);
    });
    this.emit(type);
  }

  private appendInlineChildren(parent: P5Element, onImage: () => void): void {
    for (const child of parent.childNodes) {
      if (isTextNode(child)) {
        this.builder.append(child.value);
        continue;
      }
      if (!isElement(child)) {
        continue;
      }
      const tag = child.tagName;
      if (SKIP_TAGS.has(tag)) {
        continue;
      }
      if (isFootnoteElement(child)) {
        this.collectNote(child);
        continue;
      }
      if (tag === 'br') {
        this.builder.append(' ');
        continue;
      }
      if (tag === 'img') {
        onImage();
        this.emitImage(child);
        continue;
      }
      if (tag === 'svg') {
        const imageElement = findDescendant(child, 'image');
        if (imageElement) {
          onImage();
          this.emitImage(imageElement, child);
        }
        continue;
      }

      const start = this.builder.length;
      const markType = markTypeFor(tag);
      const noteReference = isNoteReference(child);
      const noteFragment = noteReference ? splitHref(attrValue(child, 'href')).fragment : '';
      this.appendInlineChildren(child, onImage);
      const end = this.builder.length;
      if (markType) {
        this.builder.addMark(markType, start, end);
      }
      if (noteFragment) {
        this.builder.addMark('noteRef', start, end, {
          noteId: noteId(this.ctx.bookId, noteFragment),
        });
      }
    }
  }

  private collectNote(element: P5Element): void {
    const fragment = attrValue(element, 'id');
    if (!fragment) {
      return;
    }
    const id = noteId(this.ctx.bookId, fragment);
    if (this.ctx.notes.has(id)) {
      return;
    }
    const builder = new InlineBuilder();
    for (const child of element.childNodes) {
      if (isTextNode(child)) {
        builder.append(child.value);
        continue;
      }
      if (!isElement(child)) {
        continue;
      }
      if (SKIP_TAGS.has(child.tagName) || isFootnoteElement(child)) {
        continue;
      }
      builder.append(elementText(child));
      builder.append(' ');
    }
    const finished = builder.finish();
    if (!finished.text) {
      return;
    }
    this.ctx.notes.set(id, { id, text: finished.text, marks: finished.marks });
  }

  private emitTable(table: P5Element): void {
    const rows: string[] = [];
    const collectRows = (element: P5Element): void => {
      for (const child of element.childNodes) {
        if (!isElement(child)) {
          continue;
        }
        if (child.tagName === 'tr') {
          rows.push(this.rowText(child));
          continue;
        }
        collectRows(child);
      }
    };
    collectRows(table);
    const text = rows.length > 0 ? rows.join('\n') : collapseWhitespace(elementText(table));
    this.emitRaw('table', text);
  }

  private rowText(row: P5Element): string {
    const cells: string[] = [];
    const collectCells = (element: P5Element): void => {
      for (const child of element.childNodes) {
        if (!isElement(child)) {
          continue;
        }
        if (child.tagName === 'td' || child.tagName === 'th') {
          cells.push(collapseWhitespace(elementText(child)));
          continue;
        }
        if (child.tagName === 'tr') {
          continue;
        }
        collectCells(child);
      }
    };
    collectCells(row);
    return cells.join(' ').trim();
  }

  private emitImage(element: P5Element, svgParent?: P5Element): void {
    const src =
      attrValue(element, 'src') || attrValue(element, 'xlink:href') || attrValue(element, 'href');
    if (!src || src.startsWith('data:')) {
      return;
    }
    const path = resolveHref(this.ctx.chapterPath, src);
    const data = this.ctx.archive.read(path);
    if (!data) {
      return;
    }

    const manifest = this.ctx.manifestByPath.get(path);
    const mime =
      manifest?.mediaType || MIME_BY_EXTENSION[fileExtension(path)] || 'application/octet-stream';

    let id = this.ctx.assetIdByPath.get(path);
    if (!id) {
      const sniffed = sniffDimensions(data, mime);
      const width =
        toNumber(attrValue(element, 'width')) ??
        (svgParent ? toNumber(attrValue(svgParent, 'width')) : undefined) ??
        sniffed?.width ??
        0;
      const height =
        toNumber(attrValue(element, 'height')) ??
        (svgParent ? toNumber(attrValue(svgParent, 'height')) : undefined) ??
        sniffed?.height ??
        0;
      id = assetId(this.ctx.bookId, this.ctx.assets.length);
      this.ctx.assetIdByPath.set(path, id);
      this.ctx.assets.push({ id, mime, path, width, height, data });
    }

    const asset = this.ctx.assets.find((item) => item.id === id);
    const alt = attrValue(element, 'alt') || (svgParent ? attrValue(svgParent, 'aria-label') : '');
    const index = this.blocks.length;
    const block: Block = {
      id: blockId(this.ctx.bookId, this.ctx.chapterIndex, index),
      chapterIndex: this.ctx.chapterIndex,
      index,
      type: 'image',
      text: '',
      marks: [],
      image: {
        assetId: id,
        width: asset?.width ?? 0,
        height: asset?.height ?? 0,
        ...(alt ? { alt } : {}),
      },
    };
    this.blocks.push(block);
  }
}

export interface ContentContext {
  bookId: string;
  chapterIndex: number;
  chapterPath: string;
  archive: EpubArchive;
  manifestByPath: ReadonlyMap<string, ManifestItem>;
  assets: Asset[];
  assetIdByPath: Map<string, string>;
  notes: Map<string, Note>;
}

/** Maps an XHTML document into Block[] according to Spec §6.1. */
export function extractBlocks(html: string, context: ContentContext): Block[] {
  const document = parse(html);
  return new ChapterExtractor(context).extract(document);
}

export function firstHeadingText(blocks: readonly Block[]): string | undefined {
  return blocks.find((block) => block.type === 'heading' && block.text)?.text;
}
