import { findElement, findElements, type XmlElement } from './xml.js';
import type {
  Area,
  BoundingBox,
  ForecastPeriod,
  Location,
  LocationKind,
  Observation,
  RadarFrame,
  RadarProduct,
  RainChart,
  RawAreaLookup,
  RawForecastEntry,
  RawObservation,
  RawRainChart,
  RawWeatherFeed,
  SearchResult,
  Weather,
} from './types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const num = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toArray = <T>(value: T | T[] | undefined | null): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** Parse `YYYY-MM-DD HH:mm:ss` (UTC) or any ISO-8601 string. */
export function parseDate(value: string): Date {
  const trimmed = value.trim();
  const sqlLike = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(trimmed);
  // `+0000` -> `+00:00` for strict parsers
  const iso = sqlLike ? `${sqlLike[1]}T${sqlLike[2]}Z` : trimmed.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date: ${value}`);
  return date;
}

const nullIfNegative = (n: number | undefined): number | null => (n === undefined || n < 0 ? null : n);

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function toLocation(el: XmlElement, kind: LocationKind): Location {
  const a = el.attributes;
  const location: Location = {
    kind,
    id: a.id ?? '',
    name: a.name ?? '',
    latitude: num(a.latitude) ?? NaN,
    longitude: num(a.longitude) ?? NaN,
    countryCode: a.country ?? '',
    countryName: a['country-name'] ?? '',
  };
  if (a['province-name']) location.provinceName = a['province-name'];
  if (a.city) location.cityId = a.city;
  const continent = num(a.continent);
  if (continent !== undefined) location.continent = continent;
  const inhabitants = num(a.inhabitants);
  if (inhabitants !== undefined) location.inhabitants = inhabitants;
  if (a.timezone) location.timezone = a.timezone;
  return location;
}

export function parseSearchFeed(xml: string): SearchResult {
  const cities = findElement(xml, 'cities');
  const pois = findElement(xml, 'pois');
  return {
    cities: cities ? findElements(cities.inner, 'city').map((el) => toLocation(el, 'city')) : [],
    pois: pois ? findElements(pois.inner, 'poi').map((el) => toLocation(el, 'poi')) : [],
  };
}

// ---------------------------------------------------------------------------
// Area lookup
// ---------------------------------------------------------------------------

export function parseAreaLookup(data: unknown): Area[] {
  return toArray(data as RawAreaLookup | RawAreaLookup[] | null)
    .filter((a): a is RawAreaLookup => !!a && typeof a === 'object' && 'AREA_ID' in a)
    .map((a) => ({ type: String(a.AREA_TYPE), id: String(a.AREA_ID), centerId: String(a.CENTER_ID) }));
}

// ---------------------------------------------------------------------------
// Rain chart
// ---------------------------------------------------------------------------

export function parseRainChart(raw: RawRainChart): RainChart {
  const startTime = parseDate(raw.startdtg);
  const intervalMs = num(raw.interval) ?? 60_000;
  const stepMinutes = intervalMs / 60_000;
  const length = Math.max(raw.avg?.length ?? 0, raw.min?.length ?? 0, raw.max?.length ?? 0);

  const points = Array.from({ length }, (_, i) => ({
    time: new Date(startTime.getTime() + i * intervalMs),
    offsetMinutes: i * stepMinutes,
    avg: raw.avg?.[i] ?? 0,
    min: raw.min?.[i] ?? 0,
    max: raw.max?.[i] ?? 0,
  }));

  const rainStartsInMinutes = nullIfNegative(num(raw.startMin));
  const rainEndsInMinutes = nullIfNegative(num(raw.endMin));

  return {
    areaId: raw.uwzid,
    startTime,
    createdAt: parseDate(raw.creationdtg),
    intervalMs,
    domain: { min: num(raw.domainMin) ?? 0, max: num(raw.domainMax) ?? 100 },
    points,
    hasRain: points.some((p) => p.max > 0 || p.avg > 0),
    rainStartsInMinutes,
    rainEndsInMinutes,
    rainStartsAt: rainStartsInMinutes === null ? null : addMinutes(startTime, rainStartsInMinutes),
    rainEndsAt: rainEndsInMinutes === null ? null : addMinutes(startTime, rainEndsInMinutes),
    intensity: nullIfNegative(num(raw.intensity)),
    windDirection: num(raw.winddir) ?? 0,
    precipitationAngle: num(raw.precAngle) ?? 0,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

type Fields = Omit<ForecastPeriod, 'time' | 'intervalSeconds' | 'night' | 'raw'>;

const FIELD_MAP: [raw: string, key: keyof Fields][] = [
  ['tt', 'temperature'],
  ['tx', 'maxTemperature'],
  ['tn', 'minTemperature'],
  ['td', 'dewPoint'],
  ['dd', 'windDirection'],
  ['ff', 'windSpeed'],
  ['ffg', 'windGust'],
  ['rrr', 'precipitation'],
  ['prrr', 'precipitationProbability'],
  ['n', 'cloudCover'],
  ['ww', 'weatherCode'],
  ['symbol', 'symbol'],
  ['ppp', 'pressure'],
  ['sun', 'sunshineHours'],
  ['uvi', 'uvIndex'],
  ['uvic', 'uvIndexClass'],
];

function mapFields(entry: Record<string, unknown>, suffix = ''): Fields {
  const out: Fields = {};
  for (const [rawKey, key] of FIELD_MAP) {
    const v = num(entry[rawKey + suffix]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function toForecastPeriod(entry: RawForecastEntry): ForecastPeriod {
  const period: ForecastPeriod = { time: parseDate(entry.dtg), ...mapFields(entry), raw: entry };
  const intervalSeconds = num(entry.interval);
  if (intervalSeconds !== undefined) period.intervalSeconds = intervalSeconds;
  const night = mapFields(entry, '_n');
  if (Object.keys(night).length > 0) period.night = night;
  return period;
}

function toObservation(entry: RawObservation): Observation {
  const f = mapFields(entry);
  const obs: Observation = { time: parseDate(entry.dtg), raw: entry };
  if (f.temperature !== undefined) obs.temperature = f.temperature;
  if (f.dewPoint !== undefined) obs.dewPoint = f.dewPoint;
  if (f.windDirection !== undefined) obs.windDirection = f.windDirection;
  if (f.windSpeed !== undefined) obs.windSpeed = f.windSpeed;
  if (f.windGust !== undefined) obs.windGust = f.windGust;
  if (f.precipitation !== undefined) obs.precipitation = f.precipitation;
  const rrrh = num(entry.rrrh);
  if (rrrh !== undefined) obs.precipitationPeriodHours = rrrh;
  if (f.cloudCover !== undefined) obs.cloudCover = f.cloudCover;
  if (f.weatherCode !== undefined) obs.weatherCode = f.weatherCode;
  if (f.symbol !== undefined) obs.symbol = f.symbol;
  if (f.pressure !== undefined) obs.pressure = f.pressure;
  return obs;
}

const epoch = (seconds: number | undefined) => (seconds === undefined ? undefined : new Date(seconds * 1000));

export function parseWeatherFeed(raw: RawWeatherFeed, locationId: string): Weather {
  const weather: Weather = { locationId, raw };

  if (raw.observation) {
    const entries = toArray(raw.observation.obse?.obs).map(toObservation);
    weather.observation = { entries };
    if (raw.observation.stationId !== undefined) weather.observation.stationId = raw.observation.stationId;
    const expiresAt = epoch(num(raw.observation.expires));
    if (expiresAt) weather.observation.expiresAt = expiresAt;
    const latest = entries.reduce<Observation | undefined>(
      (acc, o) => (!acc || o.time > acc.time ? o : acc),
      undefined,
    );
    if (latest) weather.observation.latest = latest;
  }

  if (raw.forecast) {
    weather.forecast = {
      days: toArray(raw.forecast.days?.day).map(toForecastPeriod),
      hours: toArray(raw.forecast.hours?.hour).map(toForecastPeriod),
      intervals: toArray(raw.forecast.intervals?.interval).map(toForecastPeriod),
    };
    if (raw.forecast.stationId !== undefined) weather.forecast.stationId = raw.forecast.stationId;
    const expiresAt = epoch(num(raw.forecast.expires));
    if (expiresAt) weather.forecast.expiresAt = expiresAt;
  }

  return weather;
}

// ---------------------------------------------------------------------------
// Radar products
// ---------------------------------------------------------------------------

function toBounds(a: Record<string, string>): BoundingBox {
  const lat1 = num(a.latitude1) ?? NaN;
  const lat2 = num(a.latitude2) ?? NaN;
  const lon1 = num(a.longitude1) ?? NaN;
  const lon2 = num(a.longitude2) ?? NaN;
  return {
    north: Math.max(lat1, lat2),
    south: Math.min(lat1, lat2),
    east: Math.max(lon1, lon2),
    west: Math.min(lon1, lon2),
  };
}

export function parseRadarProducts(xml: string): RadarProduct[] {
  const products: RadarProduct[] = [];
  for (const group of findElements(xml, 'MapGroup')) {
    const g = {
      name: group.attributes.name ?? '',
      description: group.attributes.description ?? '',
      type: num(group.attributes.groupType) ?? 0,
    };
    for (const d of findElements(group.inner, 'MapParameterDescriptor')) {
      const proj = findElement(d.inner, 'Projection');
      const area = findElement(d.inner, 'MapArea');
      const bounds = area ? findElement(area.inner, 'BoundingRect') : undefined;
      const p = proj?.attributes ?? {};
      products.push({
        id: d.attributes.id ?? '',
        name: d.attributes.name ?? '',
        description: d.attributes.description ?? '',
        group: g,
        projection: {
          proj4: proj?.text ?? '',
          pixelWidthMeters: num(p.geoPixelWidthMeter) ?? NaN,
          pixelHeightMeters: num(p.geoPixelHeightMeter) ?? NaN,
          width: num(p.pixelCountWidth) ?? NaN,
          height: num(p.pixelCountHeight) ?? NaN,
          offsetX: num(p.pixelOffsetX) ?? 0,
          offsetY: num(p.pixelOffsetY) ?? 0,
          velocityScale: num(p.velocityScale) ?? 1,
        },
        area: {
          name: area?.attributes.name ?? '',
          minZoom: num(area?.attributes.minZoom) ?? 0,
          maxZoom: num(area?.attributes.maxZoom) ?? 0,
          bounds: toBounds(bounds?.attributes ?? {}),
        },
        countries: findElements(d.inner, 'Country').map((c) =>
          c.attributes.name ? { code: c.attributes.code ?? '', name: c.attributes.name } : { code: c.attributes.code ?? '' },
        ),
      });
    }
  }
  return products;
}

// ---------------------------------------------------------------------------
// Radar frames
// ---------------------------------------------------------------------------

export function parseRadarFrames(xml: string, baseUrl: string, fallbackProductId: string): RadarFrame[] {
  const root = findElement(xml, 'MapParameterProductionFeed');
  const productId = root?.attributes.parameter || fallbackProductId;
  const base = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(productId)}/`;

  return findElements(xml, 'Time')
    .map(({ attributes: a }) => {
      const imageFilename = a.imageFilename ?? '';
      const velocityFilename = a.velocityFilename ? a.velocityFilename : null;
      return {
        productId,
        time: parseDate(a.dtg ?? ''),
        modifiedAt: parseDate(a.mtime ?? a.dtg ?? ''),
        isForecast: a.forecast === '1',
        imageUrl: base + imageFilename,
        velocityUrl: velocityFilename ? base + velocityFilename : null,
        imageFilename,
        velocityFilename,
      };
    })
    .filter((f) => f.imageFilename)
    .sort((x, y) => x.time.getTime() - y.time.getTime());
}

/** True when the coordinates fall inside the product's bounding box. */
export function productCovers(product: RadarProduct, latitude: number, longitude: number): boolean {
  const b = product.area.bounds;
  return latitude <= b.north && latitude >= b.south && longitude <= b.east && longitude >= b.west;
}
