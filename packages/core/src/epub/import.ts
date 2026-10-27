import { chapterId, contentId } from '../ids.js';
import { PIPELINE_VERSION } from '../types.js';
import type { Asset, Chapter, ImportedBook, Note, TocEntry } from '../types.js';
import { openEpubArchive } from './archive.js';
import { extractBlocks, firstHeadingText } from './content.js';
import { parseContainer, parseOpf } from './opf.js';
import { parseNavDocument, parseNcx, mapTocToSpine, type TocLink } from './toc.js';
import type { ManifestItem } from './opf.js';

export interface EpubImportOptions {
  /** Used only when the package metadata has no title. */
  fallbackTitle?: string;
}

function stripExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? name : name.slice(0, index);
}

function chapterTitle(
  chapterIndex: number,
  toc: readonly TocEntry[],
  blocks: Parameters<typeof firstHeadingText>[0],
): { title: string; level: number } {
  const entry = toc.find((item) => item.chapterIndex === chapterIndex);
  if (entry) {
    return { title: entry.title, level: entry.level };
  }
  const heading = firstHeadingText(blocks);
  if (heading) {
    return { title: heading, level: 1 };
  }
  return { title: `Chapter ${chapterIndex + 1}`, level: 1 };
}

function isXhtmlItem(item: ManifestItem): boolean {
  return item.mediaType === 'application/xhtml+xml' || /\.x?html?$/i.test(item.path);
}

/**
 * Imports an EPUB into normalized chapters/blocks. Pure: no I/O outside the
 * provided bytes.
 */
export async function importEpub(
  bytes: Uint8Array,
  fileName = 'book.epub',
  options: EpubImportOptions = {},
): Promise<ImportedBook> {
  const bookId = await contentId(bytes);
  const archive = openEpubArchive(bytes);
  const opfPath = parseContainer(archive);
  const opf = parseOpf(archive, opfPath);

  const manifestById = new Map(opf.manifest.map((item) => [item.id, item]));
  const manifestByPath = new Map(opf.manifest.map((item) => [item.path, item]));

  const spineItems: ManifestItem[] = [];
  for (const spineItem of opf.spine) {
    const item = manifestById.get(spineItem.idref);
    if (!item || !isXhtmlItem(item)) {
      continue;
    }
    spineItems.push(item);
  }

  const chapterIndexByPath = new Map<string, number>();
  spineItems.forEach((item, index) => {
    if (!chapterIndexByPath.has(item.path)) {
      chapterIndexByPath.set(item.path, index);
    }
  });

  let tocPath = '';
  let tocLinks: TocLink[] = [];
  const navItem =
    opf.manifest.find((item) => item.properties.includes('nav')) ??
    opf.manifest.find((item) => /(^|\/)nav\.x?html?$/i.test(item.path));
  if (navItem) {
    const html = archive.readText(navItem.path);
    if (html) {
      tocPath = navItem.path;
      tocLinks = parseNavDocument(html);
    }
  }
  if (tocLinks.length === 0) {
    const ncxItem =
      (opf.tocId ? manifestById.get(opf.tocId) : undefined) ??
      opf.manifest.find((item) => item.mediaType === 'application/x-dtbncx+xml');
    if (ncxItem) {
      const xml = archive.readText(ncxItem.path);
      if (xml) {
        tocPath = ncxItem.path;
        tocLinks = parseNcx(xml);
      }
    }
  }

  const toc = tocPath ? mapTocToSpine(tocLinks, tocPath, chapterIndexByPath) : [];

  const notes = new Map<string, Note>();
  const assets: Asset[] = [];
  const assetIdByPath = new Map<string, string>();
  const chapters: Chapter[] = [];

  spineItems.forEach((item, index) => {
    const html = archive.readText(item.path);
    const blocks = html
      ? extractBlocks(html, {
          bookId,
          chapterIndex: index,
          chapterPath: item.path,
          archive,
          manifestByPath,
          assets,
          assetIdByPath,
          notes,
        })
      : [];
    const { title, level } = chapterTitle(index, toc, blocks);
    chapters.push({
      id: chapterId(bookId, index),
      index,
      title,
      tocLevel: level,
      blocks,
    });
  });

  const finalToc: TocEntry[] =
    toc.length > 0
      ? toc
      : chapters.map((chapter) => ({
          title: chapter.title,
          chapterIndex: chapter.index,
          level: 1,
        }));

  return {
    bookId,
    metadata: {
      title: opf.metadata.title || options.fallbackTitle || stripExtension(fileName),
      author: opf.metadata.author,
      lang: opf.metadata.lang || 'en',
      format: 'epub',
    },
    pipelineVersion: PIPELINE_VERSION,
    chapters,
    notes: [...notes.values()],
    assets,
    toc: finalToc,
  };
}
