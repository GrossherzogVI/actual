/**
 * Heuristic encoding detection and conversion for German bank CSV files.
 * German banks commonly use Windows-1252 (CP1252) encoding.
 */

/**
 * Detects encoding by scanning for byte patterns typical of Windows-1252.
 * Windows-1252 uses bytes 0x80–0x9F for additional characters not in ISO-8859-1.
 * UTF-8 multi-byte sequences follow specific patterns (10xxxxxx continuation bytes).
 */
export function detectEncoding(buffer: ArrayBuffer): 'utf-8' | 'windows-1252' {
  const bytes = new Uint8Array(buffer);

  // Check for UTF-8 BOM (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8';
  }

  let i = 0;
  let utf8Sequences = 0;
  let win1252Indicators = 0;

  while (i < bytes.length) {
    const b = bytes[i];

    // Windows-1252 specific range (0x80–0x9F): characters like €, „, ", …
    // These bytes are undefined or control chars in ISO-8859-1 / Latin-1
    if (b >= 0x80 && b <= 0x9f) {
      win1252Indicators++;
      i++;
      continue;
    }

    // Check for valid UTF-8 multi-byte sequence
    if (b >= 0xc2 && b <= 0xdf) {
      // 2-byte sequence
      if (i + 1 < bytes.length && (bytes[i + 1] & 0xc0) === 0x80) {
        utf8Sequences++;
        i += 2;
        continue;
      }
    } else if (b >= 0xe0 && b <= 0xef) {
      // 3-byte sequence
      if (
        i + 2 < bytes.length &&
        (bytes[i + 1] & 0xc0) === 0x80 &&
        (bytes[i + 2] & 0xc0) === 0x80
      ) {
        utf8Sequences++;
        i += 3;
        continue;
      }
    } else if (b >= 0xf0 && b <= 0xf4) {
      // 4-byte sequence
      if (
        i + 3 < bytes.length &&
        (bytes[i + 1] & 0xc0) === 0x80 &&
        (bytes[i + 2] & 0xc0) === 0x80 &&
        (bytes[i + 3] & 0xc0) === 0x80
      ) {
        utf8Sequences++;
        i += 4;
        continue;
      }
    }

    i++;
  }

  // If we see Windows-1252-specific bytes and no valid UTF-8 multi-byte sequences,
  // it's almost certainly Windows-1252.
  if (win1252Indicators > 0 && utf8Sequences === 0) {
    return 'windows-1252';
  }

  // If there are valid UTF-8 sequences and no Win-1252 specific bytes, it's UTF-8.
  return 'utf-8';
}

/**
 * Decodes an ArrayBuffer to a string using the specified encoding.
 * Falls back to windows-1252 (as latin1 via iso-8859-1) if the encoding is not utf-8.
 */
export function decodeText(buffer: ArrayBuffer, encoding: string): string {
  // TextDecoder supports 'utf-8' and 'windows-1252' natively in all modern browsers.
  // 'windows-1252' is aliased as 'cp1252' or 'x-cp1252' depending on the runtime.
  const normalised = encoding.toLowerCase().replace(/[-_]/g, '');

  let label: string;
  if (normalised === 'utf8') {
    label = 'utf-8';
  } else {
    // Use windows-1252 for any non-UTF-8 encoding (covers cp1252, iso-8859-1, etc.)
    label = 'windows-1252';
  }

  try {
    const decoder = new TextDecoder(label, { fatal: false });
    return decoder.decode(buffer);
  } catch {
    // Fallback: decode as UTF-8 with replacement characters
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(buffer);
  }
}
