import { XMLParser } from 'fast-xml-parser';
import { parse as parseHtml } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

import { resolveHref, splitHref } from '../path.js';
import type { TocEntry } from '../types.js';

type P5Node = DefaultTreeAdapterTypes.Node;
type P5Element = DefaultTreeAdapterTypes.Element;

export interface TocLink {
  title: string;
  href: string;
  level: number;
}

const ncxParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
  isArray: (name) => name === 'navPoint',
});

function isElement(node: P5Node): node is P5Element {
  return 'tagName' in node;
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function elementText(node: P5Node): string {
  if ('value' in node) {
    return node.value;
  }
  if (!('childNodes' in node)) {
    return '';
  }
  let text = '';
  for (const child of node.childNodes) {
    text += elementText(child);
  }
  return text;
}

function attrValue(element: P5Element, name: string): string {
  return element.attrs.find((item) => item.name === name)?.value ?? '';
}

function hasType(element: P5Element, value: string): boolean {
  return attrValue(element, 'epub:type').split(/\s+/).includes(value);
}

function hasRole(element: P5Element, value: string): boolean {
  return attrValue(element, 'role').split(/\s+/).includes(value);
}

function findFirst(node: P5Node, predicate: (node: P5Element) => boolean): P5Element | undefined {
  if (isElement(node) && predicate(node)) {
    return node;
  }
  if (!('childNodes' in node)) {
    return undefined;
  }
  for (const child of node.childNodes) {
    const found = findFirst(child, predicate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findAnchorInListItem(item: P5Element): P5Element | undefined {
  for (const child of item.childNodes) {
    if (!isElement(child)) {
      continue;
    }
    if (child.tagName === 'a') {
      return child;
    }
    if (child.tagName === 'ol' || child.tagName === 'ul') {
      continue;
    }
    const nested = findAnchorInListItem(child);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function walkNavList(list: P5Element, level: number, out: TocLink[]): void {
  for (const child of list.childNodes) {
    if (!isElement(child) || child.tagName !== 'li') {
      continue;
    }
    const anchor = findAnchorInListItem(child);
    if (anchor) {
      const href = attrValue(anchor, 'href');
      const title = collapseWhitespace(elementText(anchor));
      if (href && title) {
        out.push({ href, title, level });
      }
    }
    const nestedList = child.childNodes.find(
      (node): node is P5Element =>
        isElement(node) && (node.tagName === 'ol' || node.tagName === 'ul'),
    );
    if (nestedList) {
      walkNavList(nestedList, level + 1, out);
    }
  }
}

export function parseNavDocument(html: string): TocLink[] {
  const document = parseHtml(html);
  const body = findFirst(document, (element) => element.tagName === 'body');
  if (!body) {
    return [];
  }
  const navs: P5Element[] = [];
  const collectNavs = (element: P5Element): void => {
    if (element.tagName === 'nav') {
      navs.push(element);
    }
    for (const child of element.childNodes) {
      if (isElement(child)) {
        collectNavs(child);
      }
    }
  };
  collectNavs(body);

  const tocNav = navs.find((nav) => hasType(nav, 'toc') || hasRole(nav, 'doc-toc')) ?? navs[0];
  if (!tocNav) {
    return [];
  }
  const list = findFirst(tocNav, (element) => element.tagName === 'ol' || element.tagName === 'ul');
  if (!list) {
    return [];
  }
  const links: TocLink[] = [];
  walkNavList(list, 1, links);
  return links;
}

interface NcxNavPoint {
  navLabel?: { text?: unknown };
  content?: { src?: string };
  navPoint?: NcxNavPoint[];
}

function ncxText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && '#text' in value) {
    return ncxText((value as Record<string, unknown>)['#text']);
  }
  return '';
}

function walkNcx(points: NcxNavPoint[], level: number, out: TocLink[]): void {
  for (const point of points) {
    const title = collapseWhitespace(ncxText(point.navLabel?.text));
    const src = point.content?.src ?? '';
    if (src && title) {
      out.push({ title, href: src, level });
    }
    if (point.navPoint) {
      walkNcx(point.navPoint, level + 1, out);
    }
  }
}

export function parseNcx(xml: string): TocLink[] {
  let parsed: unknown;
  try {
    parsed = ncxParser.parse(xml);
  } catch {
    return [];
  }
  const record = parsed as Record<string, unknown>;
  const ncx = record['ncx'] as Record<string, unknown> | undefined;
  const navMap = ncx?.['navMap'] as Record<string, unknown> | undefined;
  const points = (navMap?.['navPoint'] as NcxNavPoint[] | undefined) ?? [];
  const links: TocLink[] = [];
  walkNcx(points, 1, links);
  return links;
}

export function mapTocToSpine(
  links: readonly TocLink[],
  tocPath: string,
  chapterIndexByPath: ReadonlyMap<string, number>,
): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const link of links) {
    const { path } = splitHref(link.href);
    const resolved = path === '' ? tocPath : resolveHref(tocPath, link.href);
    const chapterIndex = chapterIndexByPath.get(resolved);
    if (chapterIndex === undefined) {
      continue;
    }
    entries.push({ title: link.title, chapterIndex, level: link.level });
  }
  return entries;
}
