import { XMLParser } from 'fast-xml-parser';

import { InvalidEpubError, type EpubArchive } from './archive.js';
import { resolveHref } from '../path.js';

export interface ManifestItem {
  id: string;
  href: string;
  path: string;
  mediaType: string;
  properties: string[];
}

export interface SpineItem {
  idref: string;
  linear: boolean;
}

export interface OpfMetadata {
  title: string;
  author: string;
  lang: string;
}

export interface OpfPackage {
  version: string;
  path: string;
  metadata: OpfMetadata;
  manifest: ManifestItem[];
  spine: SpineItem[];
  tocId?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

type XmlValue = string | number | boolean | Record<string, unknown> | XmlValue[] | undefined;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function textOf(value: XmlValue): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => textOf(item))
      .filter(Boolean)
      .join(' ');
  }
  const record = value as Record<string, unknown>;
  if ('#text' in record) {
    return textOf(record['#text'] as XmlValue);
  }
  return '';
}

function attr(value: unknown, name: string): string {
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const found = (value as Record<string, unknown>)[name];
  return typeof found === 'string' || typeof found === 'number' ? String(found) : '';
}

export function parseContainer(archive: EpubArchive): string {
  const container = archive.readText('META-INF/container.xml');
  if (!container) {
    throw new InvalidEpubError('Missing META-INF/container.xml');
  }
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(container);
  } catch (error) {
    throw new InvalidEpubError(`Invalid container.xml: ${String(error)}`);
  }
  const record = parsed as Record<string, unknown>;
  const containerNode = record['container'] as Record<string, unknown> | undefined;
  const rootfiles = containerNode?.['rootfiles'] as Record<string, unknown> | undefined;
  const rootfile = asArray(rootfiles?.['rootfile'] as Record<string, unknown> | undefined)[0];
  const fullPath = attr(rootfile, 'full-path');
  if (!fullPath) {
    throw new InvalidEpubError('container.xml has no rootfile full-path');
  }
  return fullPath;
}

export function parseOpf(archive: EpubArchive, opfPath: string): OpfPackage {
  const xml = archive.readText(opfPath);
  if (!xml) {
    throw new InvalidEpubError(`Missing OPF package: ${opfPath}`);
  }

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (error) {
    throw new InvalidEpubError(`Invalid OPF package: ${String(error)}`);
  }

  const record = parsed as Record<string, unknown>;
  const packageNode = record['package'] as Record<string, unknown> | undefined;
  if (!packageNode) {
    throw new InvalidEpubError('OPF has no package element');
  }

  const metadataNode = packageNode['metadata'] as Record<string, unknown> | undefined;
  const titles = asArray(metadataNode?.['title'] as XmlValue)
    .map((item) => textOf(item).trim())
    .filter(Boolean);
  const title = titles[0] ?? '';
  const creators = asArray(metadataNode?.['creator'] as XmlValue).map((item) =>
    textOf(item).trim(),
  );
  const langs = asArray(metadataNode?.['language'] as XmlValue).map((item) => textOf(item).trim());

  const manifestNode = packageNode['manifest'] as Record<string, unknown> | undefined;
  const manifest = asArray(manifestNode?.['item'] as Record<string, unknown> | undefined).flatMap(
    (item): ManifestItem[] => {
      const id = attr(item, 'id');
      const href = attr(item, 'href');
      if (!id || !href) {
        return [];
      }
      return [
        {
          id,
          href,
          path: resolveHref(opfPath, href),
          mediaType: attr(item, 'media-type'),
          properties: attr(item, 'properties').split(/\s+/).filter(Boolean),
        },
      ];
    },
  );

  const spineNode = packageNode['spine'] as Record<string, unknown> | undefined;
  const spine = asArray(spineNode?.['itemref'] as Record<string, unknown> | undefined).flatMap(
    (item): SpineItem[] => {
      const idref = attr(item, 'idref');
      if (!idref) {
        return [];
      }
      return [{ idref, linear: attr(item, 'linear') !== 'no' }];
    },
  );

  return {
    version: attr(packageNode, 'version') || '2.0',
    path: opfPath,
    metadata: {
      title,
      author: creators.filter(Boolean).join(', '),
      lang: (langs[0] ?? '').toLowerCase(),
    },
    manifest,
    spine,
    ...(attr(spineNode, 'toc') ? { tocId: attr(spineNode, 'toc') } : {}),
  };
}
