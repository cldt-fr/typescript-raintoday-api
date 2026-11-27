// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// ---------------------------------------------------------------------------
// Location search  (weatherpro/SearchFeed.php)
// ---------------------------------------------------------------------------

export type LocationKind = 'city' | 'poi';

export interface Location extends Coordinates {
  kind: LocationKind;
  /** Location id, used by {@link RainTodayClient.getWeather} (`lid`). */
  id: string;
  name: string;
  /** MeteoGroup internal country id (often the phone prefix, e.g. `33` for France). */
  countryCode: string;
  countryName: string;
  provinceName?: string;
  /** MeteoGroup internal city id (cities only). */
  cityId?: string;
  continent?: number;
  inhabitants?: number;
  /** IANA time zone, e.g. `Europe/Paris`. */
  timezone?: string;
}

export interface SearchResult {
  cities: Location[];
  pois: Location[];
}

export interface SearchOptions {
  /** Maximum number of results per category. Default: 20. */
  limit?: number;
  /** Language/locale of country and province names. Default: client `lang` (`fr_FR`). */
  lang?: string;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Area lookup  (AlertsPro/AlertsProPollService.php?method=lookupCoord)
// ---------------------------------------------------------------------------

export interface RawAreaLookup {
  AREA_TYPE: string;
  AREA_ID: string;
  CENTER_ID: string;
}

export interface Area {
  /** Area type, e.g. `UWZ`. */
  type: string;
  /** Area id used by the rain chart service, e.g. `UWZFR4916`. */
  id: string;
  centerId: string;
}

// ---------------------------------------------------------------------------
// Rain chart / minute nowcast  (weatherpro/RainService.php?method=getRainChart)
// ---------------------------------------------------------------------------

export interface RawRainChart {
  precAngle: number;
  domainMax: number;
  domainMin: number;
  avg: number[];
  min: number[];
  max: number[];
  /** Minute (from `startdtg`) at which rain starts, -1 if none. */
  startMin: number;
  /** Minute (from `startdtg`) at which rain stops, -1 if none. */
  endMin: number;
  intensity: number;
  uwzid: string;
  winddir: string;
  /** `YYYY-MM-DD HH:mm:ss`, UTC. */
  startdtg: string;
  /** `YYYY-MM-DD HH:mm:ss`, UTC. */
  creationdtg: string;
  /** Step between two values, in milliseconds (as a string). */
  interval: string;
}

export interface RainChartPoint {
  time: Date;
  /** Minutes elapsed since {@link RainChart.startTime}. */
  offsetMinutes: number;
  /** Average intensity over the area, on the `domain` scale (0-100). */
  avg: number;
  min: number;
  max: number;
}

export interface RainChart {
  areaId: string;
  /** Time of the first value (radar observation time). */
  startTime: Date;
  /** When the nowcast was computed. */
  createdAt: Date;
  intervalMs: number;
  /** Value scale for avg/min/max. */
  domain: { min: number; max: number };
  points: RainChartPoint[];
  /** True when any point forecasts rain (`max > 0`). */
  hasRain: boolean;
  /** Minutes after `startTime` when rain starts, `null` when none is expected. */
  rainStartsInMinutes: number | null;
  /** Minutes after `startTime` when rain stops, `null` when unknown/none. */
  rainEndsInMinutes: number | null;
  /** Absolute time when rain starts, `null` when none is expected. */
  rainStartsAt: Date | null;
  /** Absolute time when rain stops, `null` when unknown/none. */
  rainEndsAt: Date | null;
  /** Overall intensity class reported by the API, `null` when none (-1). */
  intensity: number | null;
  /** Direction the precipitation comes from, in degrees. */
  windDirection: number;
  /** Precipitation movement angle, in degrees. */
  precipitationAngle: number;
  raw: RawRainChart;
}

// ---------------------------------------------------------------------------
// Weather feed  (weatherpro/WeatherServiceFeed.php)
// ---------------------------------------------------------------------------

export type WeatherMode = 'observation' | 'forecast';

export interface WeatherOptions {
  /** `observation` returns only the latest observation; `forecast` (default) adds the forecast. */
  mode?: WeatherMode;
  signal?: AbortSignal;
}

/** Raw observation entry (`obs`). */
export interface RawObservation {
  dtg: string;
  tt?: number;
  td?: number;
  dd?: number;
  ff?: number;
  ffg?: number;
  rrr?: number;
  rrrh?: number;
  n?: number;
  ww?: number;
  symbol?: number;
  ppp?: number;
  [key: string]: unknown;
}

/** Raw forecast entry (`day`, `hour` or `interval`). Suffix `_n` = night values. */
export interface RawForecastEntry {
  dtg: string;
  interval?: number;
  [key: string]: unknown;
}

export interface RawWeatherFeed {
  observation?: {
    obse?: { obs?: RawObservation | RawObservation[] };
    stationId?: number;
    expires?: number;
  };
  forecast?: {
    days?: { day?: RawForecastEntry | RawForecastEntry[] };
    hours?: { hour?: RawForecastEntry | RawForecastEntry[] };
    intervals?: { interval?: RawForecastEntry | RawForecastEntry[] };
    stationId?: number;
    expires?: number;
  };
}

export interface Observation {
  time: Date;
  /** Air temperature, °C (`tt`). */
  temperature?: number;
  /** Dew point, °C (`td`). */
  dewPoint?: number;
  /** Wind direction, degrees (`dd`). */
  windDirection?: number;
  /** Wind speed (`ff`). */
  windSpeed?: number;
  /** Wind gusts (`ffg`). */
  windGust?: number;
  /** Precipitation amount, mm (`rrr`). */
  precipitation?: number;
  /** Period covered by `precipitation`, hours (`rrrh`). */
  precipitationPeriodHours?: number;
  /** Cloud cover, octas 0-8 (`n`). */
  cloudCover?: number;
  /** WMO present weather code (`ww`). */
  weatherCode?: number;
  /** MeteoGroup weather symbol code (`symbol`). */
  symbol?: number;
  /** Sea-level pressure, hPa (`ppp`). */
  pressure?: number;
  raw: RawObservation;
}

export interface ForecastPeriod {
  time: Date;
  /** Length of the period, seconds. */
  intervalSeconds?: number;
  /** Temperature, °C (`tt`) — hourly / interval forecasts. */
  temperature?: number;
  /** Max temperature, °C (`tx`) — daily forecasts. */
  maxTemperature?: number;
  /** Min temperature, °C (`tn`) — daily forecasts. */
  minTemperature?: number;
  dewPoint?: number;
  windDirection?: number;
  windSpeed?: number;
  windGust?: number;
  /** Precipitation amount, mm (`rrr`). */
  precipitation?: number;
  /** Precipitation probability, % (`prrr`). */
  precipitationProbability?: number;
  cloudCover?: number;
  weatherCode?: number;
  symbol?: number;
  pressure?: number;
  /** Sunshine duration, hours (`sun`). */
  sunshineHours?: number;
  /** UV index (`uvi`). */
  uvIndex?: number;
  /** UV index class (`uvic`). */
  uvIndexClass?: number;
  /** Night-time values (fields suffixed with `_n` in the raw feed), daily forecasts only. */
  night?: Omit<ForecastPeriod, 'time' | 'intervalSeconds' | 'night' | 'raw'>;
  raw: RawForecastEntry;
}

export interface Weather {
  locationId: string;
  observation?: {
    stationId?: number;
    expiresAt?: Date;
    latest?: Observation;
    entries: Observation[];
  };
  forecast?: {
    stationId?: number;
    expiresAt?: Date;
    days: ForecastPeriod[];
    hours: ForecastPeriod[];
    intervals: ForecastPeriod[];
  };
  raw: RawWeatherFeed;
}

// ---------------------------------------------------------------------------
// Radar  (MapService.php?method=getParameters, cdn .../images.xml)
// ---------------------------------------------------------------------------

export interface RadarProjection {
  /** PROJ.4 definition string of the radar image grid. */
  proj4: string;
  /** Size of one pixel, in projection metres. */
  pixelWidthMeters: number;
  pixelHeightMeters: number;
  /** Image size, in pixels. */
  width: number;
  height: number;
  /** Projected coordinates of the image origin. */
  offsetX: number;
  offsetY: number;
  velocityScale: number;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface RadarProduct {
  /** Product id, e.g. `rad_fr`. */
  id: string;
  name: string;
  description: string;
  group: { name: string; description: string; type: number };
  projection: RadarProjection;
  area: { name: string; minZoom: number; maxZoom: number; bounds: BoundingBox };
  countries: { code: string; name?: string }[];
}

export interface RadarFrame {
  productId: string;
  /** Valid time of the frame. */
  time: Date;
  /** When the image file was produced. */
  modifiedAt: Date;
  isForecast: boolean;
  /** Radar reflectivity / precipitation image (JPEG). */
  imageUrl: string;
  /** Motion (velocity) field image (JPEG), `null` when not provided. */
  velocityUrl: string | null;
  imageFilename: string;
  velocityFilename: string | null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface RainTodayEndpoints {
  /** Default: `https://weatherpro.consumer.meteogroup.com/weatherpro` */
  weatherpro: string;
  /** Default: `https://feed.alertspro.meteogroup.com/AlertsPro` */
  alertspro: string;
  /** Default: `https://mapservice.weatherpro.meteogroup.de` */
  mapservice: string;
  /** Default: `https://cdn.meteogroup.de/images/mapengine/rain2.0` */
  radarCdn: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RainTodayClientOptions {
  /** Custom fetch implementation (defaults to global `fetch`). */
  fetch?: FetchLike;
  /** User-Agent header sent with each request (Node only; ignored by browsers). */
  userAgent?: string;
  /** Default locale for search results. Default: `fr_FR`. */
  lang?: string;
  /** Per-request timeout in ms. Default: 15000. Set to 0 to disable. */
  timeoutMs?: number;
  /** Override service base URLs (proxy, tests...). */
  endpoints?: Partial<RainTodayEndpoints>;
  /** Product id sent to the map service. Default: `de.meteogroup.RainToday`. */
  productId?: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
}
