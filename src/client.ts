import { RainTodayError, RainTodayHttpError, RainTodayNotFoundError, RainTodayParseError } from './errors.js';
import {
  parseAreaLookup,
  parseRadarFrames,
  parseRadarProducts,
  parseRainChart,
  parseSearchFeed,
  parseWeatherFeed,
  productCovers,
} from './parsers.js';
import type {
  Area,
  Coordinates,
  FetchLike,
  RadarFrame,
  RadarProduct,
  RainChart,
  RainTodayClientOptions,
  RainTodayEndpoints,
  RawRainChart,
  RawWeatherFeed,
  RequestOptions,
  SearchOptions,
  SearchResult,
  Weather,
  WeatherOptions,
} from './types.js';

export const DEFAULT_ENDPOINTS: RainTodayEndpoints = {
  weatherpro: 'https://weatherpro.consumer.meteogroup.com/weatherpro',
  alertspro: 'https://feed.alertspro.meteogroup.com/AlertsPro',
  mapservice: 'https://mapservice.weatherpro.meteogroup.de',
  radarCdn: 'https://cdn.meteogroup.de/images/mapengine/rain2.0',
};

const DEFAULT_USER_AGENT = 'raintoday-api (+https://github.com/cldt-fr/typescript-raintoday-api)';

type Query = Record<string, string | number | undefined>;

export interface FindRadarProductOptions {
  /**
   * MeteoGroup country code (e.g. `33` for France, as in {@link Location.countryCode}).
   * When given, a product covering that country is preferred.
   */
  countryCode?: string;
}

/**
 * Client for the (unofficial, undocumented) APIs used by the RainToday app.
 *
 * ```ts
 * const rt = new RainTodayClient();
 * const chart = await rt.getRainChartAt({ latitude: 48.85, longitude: 2.35 });
 * console.log(chart.hasRain, chart.rainStartsAt);
 * ```
 */
export class RainTodayClient {
  readonly endpoints: RainTodayEndpoints;
  private readonly fetchImpl: FetchLike;
  private readonly userAgent: string;
  private readonly lang: string;
  private readonly timeoutMs: number;
  private readonly productId: string;

  constructor(options: RainTodayClientOptions = {}) {
    const f = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new RainTodayError('No fetch implementation available: pass `fetch` in the client options.');
    this.fetchImpl = f;
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...options.endpoints };
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.lang = options.lang ?? 'fr_FR';
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.productId = options.productId ?? 'de.meteogroup.RainToday';
  }

  // -------------------------------------------------------------------------
  // Locations
  // -------------------------------------------------------------------------

  /** Search cities and points of interest by name. */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const url = this.url(this.endpoints.weatherpro, 'SearchFeed.php', {
      search: query,
      limit: options.limit ?? 20,
      lang: options.lang ?? this.lang,
    });
    return parseSearchFeed(await this.requestText(url, options));
  }

  /** Return the alert/rain areas containing the given coordinates (empty when outside coverage). */
  async lookupAreas(coordinates: Coordinates, options: RequestOptions = {}): Promise<Area[]> {
    const url = this.url(this.endpoints.alertspro, 'AlertsProPollService.php', {
      method: 'lookupCoord',
      lat: coordinates.latitude,
      lon: coordinates.longitude,
    });
    return parseAreaLookup(await this.requestJson<unknown>(url, options));
  }

  /** Return the rain area id (e.g. `UWZFR4916`) for the given coordinates, or `null` when outside coverage. */
  async lookupAreaId(coordinates: Coordinates, options: RequestOptions = {}): Promise<string | null> {
    const areas = await this.lookupAreas(coordinates, options);
    return (areas.find((a) => a.type === 'UWZ') ?? areas[0])?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // Rain nowcast
  // -------------------------------------------------------------------------

  /** Minute-by-minute rain nowcast for the next hour, for a rain area id. */
  async getRainChart(areaId: string, options: RequestOptions = {}): Promise<RainChart> {
    const url = this.url(this.endpoints.weatherpro, 'RainService.php', { method: 'getRainChart', areaID: areaId });
    const raw = await this.requestJson<RawRainChart | null>(url, options);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.avg)) {
      throw new RainTodayNotFoundError(`No rain chart available for area "${areaId}".`);
    }
    try {
      return parseRainChart(raw);
    } catch (cause) {
      throw new RainTodayParseError('Unexpected rain chart payload', url, { cause });
    }
  }

  /** Minute-by-minute rain nowcast for coordinates (area lookup + rain chart). */
  async getRainChartAt(coordinates: Coordinates, options: RequestOptions = {}): Promise<RainChart> {
    const areaId = await this.lookupAreaId(coordinates, options);
    if (!areaId) {
      throw new RainTodayNotFoundError(
        `No rain area covers ${coordinates.latitude},${coordinates.longitude} (outside RainToday coverage).`,
      );
    }
    return this.getRainChart(areaId, options);
  }

  // -------------------------------------------------------------------------
  // Weather
  // -------------------------------------------------------------------------

  /** Current observation and (by default) daily / 3-hourly / 6-hourly forecast for a location id. */
  async getWeather(locationId: string | number, options: WeatherOptions = {}): Promise<Weather> {
    const lid = String(locationId);
    const url = this.url(this.endpoints.weatherpro, 'WeatherServiceFeed.php', {
      format: 'json',
      lid,
      mode: options.mode ?? 'forecast',
    });
    const raw = await this.requestJson<RawWeatherFeed | null>(url, options);
    if (!raw || typeof raw !== 'object' || (!raw.observation && !raw.forecast)) {
      throw new RainTodayNotFoundError(`No weather data for location "${lid}".`);
    }
    try {
      return parseWeatherFeed(raw, lid);
    } catch (cause) {
      throw new RainTodayParseError('Unexpected weather payload', url, { cause });
    }
  }

  // -------------------------------------------------------------------------
  // Radar
  // -------------------------------------------------------------------------

  /** List available radar products (DE, UK, NL, CH, FR...) with their projection and coverage. */
  async getRadarProducts(options: RequestOptions = {}): Promise<RadarProduct[]> {
    const url = this.url(this.endpoints.mapservice, 'MapService.php', {
      method: 'getParameters',
      productid: this.productId,
      version: '2.0',
    });
    return parseRadarProducts(await this.requestText(url, options));
  }

  /**
   * Find the radar products covering coordinates. Products matching `countryCode` come first,
   * then smaller (more local) coverage areas.
   */
  async findRadarProducts(
    coordinates: Coordinates,
    options: FindRadarProductOptions & RequestOptions = {},
  ): Promise<RadarProduct[]> {
    const products = await this.getRadarProducts(options);
    const size = (p: RadarProduct) =>
      (p.area.bounds.north - p.area.bounds.south) * (p.area.bounds.east - p.area.bounds.west);
    const matchesCountry = (p: RadarProduct) =>
      options.countryCode !== undefined && p.countries.some((c) => c.code === String(options.countryCode));
    return products
      .filter((p) => productCovers(p, coordinates.latitude, coordinates.longitude))
      .sort((a, b) => Number(matchesCountry(b)) - Number(matchesCountry(a)) || size(a) - size(b));
  }

  /** Best radar product for coordinates, or `undefined` when none covers them. */
  async findRadarProduct(
    coordinates: Coordinates,
    options: FindRadarProductOptions & RequestOptions = {},
  ): Promise<RadarProduct | undefined> {
    return (await this.findRadarProducts(coordinates, options))[0];
  }

  /** Observation (last ~hour) and forecast (next ~hour) radar frames of a product, sorted by time. */
  async getRadarFrames(productId: string, options: RequestOptions = {}): Promise<RadarFrame[]> {
    const url = `${this.endpoints.radarCdn.replace(/\/+$/, '')}/${encodeURIComponent(productId)}/images.xml`;
    return parseRadarFrames(await this.requestText(url, options), this.endpoints.radarCdn, productId);
  }

  /** Download a radar image (JPEG bytes). Pass a frame (rain image) or any image URL. */
  async fetchRadarImage(
    frameOrUrl: RadarFrame | string,
    options: RequestOptions & { kind?: 'image' | 'velocity' } = {},
  ): Promise<Uint8Array> {
    let url: string | null;
    if (typeof frameOrUrl === 'string') url = frameOrUrl;
    else url = options.kind === 'velocity' ? frameOrUrl.velocityUrl : frameOrUrl.imageUrl;
    if (!url) throw new RainTodayNotFoundError('This frame has no velocity image.');
    const res = await this.request(url, options);
    return new Uint8Array(await res.arrayBuffer());
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  private url(base: string, path: string, query: Query): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
    // The PHP backend expects %20 rather than `+` for spaces.
    return `${base.replace(/\/+$/, '')}/${path}?${params.toString().replace(/\+/g, '%20')}`;
  }

  private async request(url: string, options: RequestOptions): Promise<Response> {
    const signals = [options.signal, this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined].filter(
      (s): s is AbortSignal => !!s,
    );
    const signal = signals.length > 1 ? anySignal(signals) : signals[0];

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: '*/*', 'Accept-Language': this.lang.replace('_', '-'), 'User-Agent': this.userAgent },
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      throw new RainTodayError(`Network error while requesting ${url}`, { cause });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new RainTodayHttpError(res.status, url, body);
    }
    return res;
  }

  private async requestText(url: string, options: RequestOptions): Promise<string> {
    return (await this.request(url, options)).text();
  }

  private async requestJson<T>(url: string, options: RequestOptions): Promise<T> {
    const text = await this.requestText(url, options);
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new RainTodayParseError('Invalid JSON response', url, { cause });
    }
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (any) return any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}
