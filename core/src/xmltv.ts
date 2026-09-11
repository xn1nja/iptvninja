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
 * A deliberately small, regex-driven XMLTV reader.
 *
 * Core stays dependency-free, and XMLTV guides are large and shallow: the
 * shape we need (`<channel>` and `<programme>` elements with a handful of
 * attributes) does not justify pulling in a full XML parser that would then
 * have to be vetted for Hermes and Tizen.
 */
export function parseXmltv(xml: string): XmltvDocument {
  const channels: XmltvChannel[] = [];
  const programmes: EpgEntry[] = [];

  const channelPattern = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
  let channelMatch: RegExpExecArray | null = channelPattern.exec(xml);
  while (channelMatch !== null) {
    const id = attributeOf(channelMatch[1] ?? '', 'id');
    if (id) {
      const body = channelMatch[2] ?? '';
      const icon = attributeOf(/<icon\b[^>]*>/i.exec(body)?.[0] ?? '', 'src');
      channels.push({
        id,
        displayNames: allTextOf(body, 'display-name'),
        icon: icon ?? null,
      });
    }
    channelMatch = channelPattern.exec(xml);
  }

  // Self-closing `<programme ... />` carries no title, so only paired tags matter.
  const programmePattern = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let programmeMatch: RegExpExecArray | null = programmePattern.exec(xml);
  while (programmeMatch !== null) {
    const attrs = programmeMatch[1] ?? '';
    const body = programmeMatch[2] ?? '';
    const channelId = attributeOf(attrs, 'channel');
    const start = parseXmltvTime(attributeOf(attrs, 'start'));
    const end = parseXmltvTime(attributeOf(attrs, 'stop'));
    const title = textOf(body, 'title');

    if (channelId && Number.isFinite(start) && Number.isFinite(end)) {
      const description = textOf(body, 'desc');
      programmes.push({
        channelId,
        title: title?.value || 'No title',
        description: description?.value || null,
        start,
        end,
        lang: title?.lang ?? null,
      });
    }
    programmeMatch = programmePattern.exec(xml);
  }

  return { channels, programmes };
}
