/**
 * @iptv-ninja/core — platform-agnostic IPTV logic.
 *
 * Hard rule: nothing under this package may import React, React Native, Expo
 * or any DOM/native API. A Samsung Tizen / LG webOS client is planned as a
 * separate thin client and consumes this package unchanged.
 */

export * from './types';
export * from './errors';
export {
  buildUrl,
  httpGetJson,
  httpGetText,
  normaliseBaseUrl,
  DEFAULT_TIMEOUT_MS,
  type FetchLike,
  type HttpClientOptions,
  type HttpResponseLike,
} from './http';
export {
  base64ToBytes,
  decodeEntities,
  decodeMaybeBase64,
  normaliseForSearch,
  utf8BytesToString,
} from './text';
export { JsonStore, MemoryStorage, type Storage } from './storage';
export {
  inferMediaKind,
  parseExtinfAttributes,
  parseM3u,
  parseM3uStrict,
  type M3uPlaylist,
  type ParseM3uOptions,
} from './m3u';
export {
  iterateXmltvChannels,
  iterateXmltvProgrammes,
  parseXmltv,
  parseXmltvAsync,
  parseXmltvTime,
  type ParseXmltvAsyncOptions,
  type XmltvChannel,
  type XmltvDocument,
} from './xmltv';
export { EpgIndex, formatClock, nowNext, programmeProgress } from './epg';
export { XtreamClient, type XtreamClientOptions } from './xtream';
export { searchChannels, type SearchOptions } from './search';
export { FavouritesRepository } from './favourites';
export {
  SourceRepository,
  validateM3uConfig,
  validateSourceConfig,
  validateXtreamConfig,
} from './sources';
export { openCatalog, type Catalog, type OpenCatalogOptions } from './catalog';
