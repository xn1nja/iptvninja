import { decodeEntities } from './text';
import type { EpgEntry } from './types';

export interface XmltvChannel {
  id: string;
  displayNames: string[];
  icon?: string | null;
}

export interface XmltvDocument {
  channels: XmltvChannel[];
  programmes: EpgEntry[];
}

/**
 * Parses an XMLTV timestamp: `20240115203000 +0100`, `20240115203000Z`, or
 * bare `20240115203000` (treated as UTC). Returns epoch ms, or NaN.
 */
export function parseXmltvTime(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4}|Z)?$/.exec(value.trim());
  if (!match) return Number.NaN;

  const [, year, month, day, hour, minute, second, offset] = match;
  const base = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  );
  if (!Number.isFinite(base)) return Number.NaN;

  if (!offset || offset === 'Z') return base;
  const sign = offset.charAt(0) === '-' ? 1 : -1;
  const offsetMinutes = Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5));
  return base + sign * offsetMinutes * 60_000;
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function textOf(fragment: string, tag: string): { value: string; lang: string | null } | null {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'i');
  const match = pattern.exec(fragment);
  if (!match) return null;
  const langMatch = /\blang\s*=\s*"([^"]*)"/i.exec(match[1] ?? '');
  const raw = stripCdata(match[2] ?? '').replace(/<[^>]+>/g, '');
  return { value: decodeEntities(raw).trim(), lang: langMatch?.[1] ?? null };
}

function allTextOf(fragment: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let match: RegExpExecArray | null = pattern.exec(fragment);
  while (match !== null) {
    const raw = stripCdata(match[1] ?? '').replace(/<[^>]+>/g, '');
    const value = decodeEntities(raw).trim();
    if (value) out.push(value);
    match = pattern.exec(fragment);
  }
  return out;
}

function attributeOf(tagSource: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = pattern.exec(tagSource);
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? '');
}

/**
 * Streams `<channel>` elements out of an XMLTV document.
 *
 * A generator rather than an array so callers can yield to the event loop
 * between items; guides from real providers run to tens of megabytes and a
 * single-threaded JS runtime cannot afford to parse one in a single pass.
 */
export function* iterateXmltvChannels(xml: string): Generator<XmltvChannel> {
  const pattern = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
  let match: RegExpExecArray | null = pattern.exec(xml);
  while (match !== null) {
    const id = attributeOf(match[1] ?? '', 'id');
    if (id) {
      const body = match[2] ?? '';
      const icon = attributeOf(/<icon\b[^>]*>/i.exec(body)?.[0] ?? '', 'src');
      yield { id, displayNames: allTextOf(body, 'display-name'), icon: icon ?? null };
    }
    match = pattern.exec(xml);
  }
}

/**
 * Streams `<programme>` elements, optionally limited to a time window.
 *
 * Self-closing `<programme ... />` carries no title, so only paired tags count.
 */
export function* iterateXmltvProgrammes(
  xml: string,
  window?: { from?: number; to?: number },
): Generator<EpgEntry> {
  const pattern = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let match: RegExpExecArray | null = pattern.exec(xml);
  while (match !== null) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const channelId = attributeOf(attrs, 'channel');
    const start = parseXmltvTime(attributeOf(attrs, 'start'));
    const end = parseXmltvTime(attributeOf(attrs, 'stop'));

    if (channelId && Number.isFinite(start) && Number.isFinite(end)) {
      const beforeWindow = window?.from !== undefined && end < window.from;
      const afterWindow = window?.to !== undefined && start > window.to;
      if (!beforeWindow && !afterWindow) {
        // Only build the entry once it is known to be wanted: the per-element
        // sub-regexes below are the expensive part of parsing a large guide.
        const title = textOf(body, 'title');
        const description = textOf(body, 'desc');
        yield {
          channelId,
          title: title?.value || 'No title',
          description: description?.value || null,
          start,
          end,
          lang: title?.lang ?? null,
        };
      }
    }
    match = pattern.exec(xml);
  }
}

/**
 * A deliberately small, regex-driven XMLTV reader.
 *
 * Core stays dependency-free, and XMLTV guides are large and shallow: the
 * shape we need (`<channel>` and `<programme>` elements with a handful of
 * attributes) does not justify pulling in a full XML parser that would then
 * have to be vetted for Hermes and Tizen.
 *
 * Synchronous, so it blocks for as long as the parse takes. Prefer
 * `parseXmltvAsync` anywhere a UI thread is involved.
 */
export function parseXmltv(xml: string): XmltvDocument {
  return {
    channels: [...iterateXmltvChannels(xml)],
    programmes: [...iterateXmltvProgrammes(xml)],
  };
}

// Declared locally so core needs no DOM or @types/node lib.
declare function setTimeout(handler: () => void, timeout: number): unknown;

/** Hands control back to the host so pending work (taps, layout) can run. */
function defaultYield(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 0);
  });
}

export interface ParseXmltvAsyncOptions {
  /** Drop programmes finishing before this epoch-ms. */
  from?: number;
  /** Drop programmes starting after this epoch-ms. */
  to?: number;
  /** Elements to process between yields. */
  chunkSize?: number;
  /** Override how control is handed back; mainly for tests. */
  yieldFn?: () => Promise<void>;
}

/**
 * `parseXmltv`, but it pauses every `chunkSize` elements so the host stays
 * responsive.
 *
 * On a phone this is the difference between a guide download quietly filling in
 * and the whole app freezing until it finishes.
 */
export async function parseXmltvAsync(
  xml: string,
  options: ParseXmltvAsyncOptions = {},
): Promise<XmltvDocument> {
  const chunkSize = options.chunkSize ?? 200;
  const handBack = options.yieldFn ?? defaultYield;
  const window =
    options.from !== undefined || options.to !== undefined
      ? { ...(options.from !== undefined ? { from: options.from } : {}),
          ...(options.to !== undefined ? { to: options.to } : {}) }
      : undefined;

  const channels: XmltvChannel[] = [];
  let processed = 0;

  for (const channel of iterateXmltvChannels(xml)) {
    channels.push(channel);
    processed += 1;
    if (processed % chunkSize === 0) await handBack();
  }

  const programmes: EpgEntry[] = [];
  for (const programme of iterateXmltvProgrammes(xml, window)) {
    programmes.push(programme);
    processed += 1;
    if (processed % chunkSize === 0) await handBack();
  }

  return { channels, programmes };
}
