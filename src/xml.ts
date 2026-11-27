/**
 * Minimal XML helpers. The MeteoGroup feeds are small and attribute-based,
 * so a tiny dependency-free extractor is enough.
 */

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  /** Inner content (raw, entities decoded) for non self-closing elements. */
  text: string;
  /** Raw inner XML, useful for nested lookups. */
  inner: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    attributes[m[1]!] = decodeEntities(m[3] ?? m[4] ?? '');
  }
  return attributes;
}

/** Strip comments, CDATA wrappers and the XML declaration. */
function clean(xml: string): string {
  return xml
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
}

/**
 * Find every element with the given tag name (non-nested occurrences of the same tag).
 */
export function findElements(xml: string, tag: string): XmlElement[] {
  const source = clean(xml);
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escaped}(\\s[^>]*?)?(\\/>|>([\\s\\S]*?)<\\/${escaped}\\s*>)`, 'g');
  const out: XmlElement[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const inner = m[3] ?? '';
    out.push({
      name: tag,
      attributes: parseAttributes(m[1] ?? ''),
      inner,
      text: decodeEntities(inner.replace(/<[^>]+>/g, '')).trim(),
    });
  }
  return out;
}

export function findElement(xml: string, tag: string): XmlElement | undefined {
  return findElements(xml, tag)[0];
}
