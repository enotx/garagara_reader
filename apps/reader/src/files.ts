import { Capacitor } from '@capacitor/core';

export interface PickedBook {
  name: string;
  bytes: Uint8Array;
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Opens the iOS document picker for epub/txt files. Web uses the file input. */
export async function pickBookFile(): Promise<PickedBook | undefined> {
  if (!Capacitor.isNativePlatform()) {
    return undefined;
  }
  const { FilePicker } = await import('@capawesome/capacitor-file-picker');
  const result = await FilePicker.pickFiles({
    types: ['application/epub+zip', 'text/plain'],
    limit: 1,
    readData: true,
  });
  const file = result.files[0];
  if (!file?.data) {
    return undefined;
  }
  return { name: file.name, bytes: decodeBase64(file.data) };
}

/** Reads a book opened from the iOS share sheet or "Open in" action. */
export async function readSharedBook(url: string): Promise<PickedBook | undefined> {
  if (!Capacitor.isNativePlatform()) {
    return undefined;
  }
  const { Filesystem } = await import('@capacitor/filesystem');
  const result = await Filesystem.readFile({ path: url });
  if (typeof result.data !== 'string') {
    return undefined;
  }
  const rawName = url.split('/').pop() ?? 'book.txt';
  let name = rawName;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    // Keep the encoded name if it is not valid percent-encoding.
  }
  return { name, bytes: decodeBase64(result.data) };
}
