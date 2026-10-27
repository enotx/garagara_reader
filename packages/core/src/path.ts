/** Decodes percent escapes, leaving malformed sequences untouched. */
export function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

/** Splits an href into its path and fragment, without query strings. */
export function splitHref(href: string): { path: string; fragment: string } {
  const withoutQuery = href.split('?')[0] ?? href;
  const hashIndex = withoutQuery.indexOf('#');
  if (hashIndex === -1) {
    return { path: decodeHref(withoutQuery), fragment: '' };
  }
  return {
    path: decodeHref(withoutQuery.slice(0, hashIndex)),
    fragment: decodeHref(withoutQuery.slice(hashIndex + 1)),
  };
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      if (parts.length === 0) {
        return '';
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

/**
 * Resolves an href relative to the file that contains it.
 * Returns an empty string when the href escapes the archive root.
 */
export function resolveHref(baseFile: string, href: string): string {
  const { path } = splitHref(href);
  if (path === '') {
    return baseFile;
  }
  if (path.startsWith('/')) {
    return normalizePath(path);
  }
  return normalizePath(`${dirname(baseFile)}/${path}`);
}

export function fileExtension(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}
