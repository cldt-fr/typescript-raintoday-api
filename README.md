# raintoday-api

[![CI](https://github.com/cldt-fr/typescript-raintoday-api/actions/workflows/ci.yml/badge.svg)](https://github.com/cldt-fr/typescript-raintoday-api/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Unofficial** TypeScript client for the APIs behind the **RainToday** app (MeteoGroup / WeatherPro):
minute-by-minute rain nowcast, radar images, weather forecasts and location search.

- Zero runtime dependencies, built on `fetch` (Node ≥ 18, Deno, Bun, browsers\*)
- ESM + CommonJS builds, fully typed
- Normalized responses (real `Date` objects, readable field names), raw payload always available as `raw`
- No API key required

> \* Not every MeteoGroup server sends CORS headers. In the browser, route requests through a proxy using the `endpoints` option.

## Installation

```bash
npm install github:cldt-fr/typescript-raintoday-api
```

## Quick start

```ts
import { RainTodayClient } from 'raintoday-api';

const rt = new RainTodayClient();

// 1. Rain in the next hour at given coordinates
const chart = await rt.getRainChartAt({ latitude: 48.8566, longitude: 2.3522 });
if (chart.hasRain) {
  console.log(`Rain from ${chart.rainStartsAt?.toLocaleTimeString()} to ${chart.rainEndsAt?.toLocaleTimeString()}`);
}
for (const p of chart.points) console.log(p.time.toISOString(), p.avg, p.min, p.max);

// 2. Location search + weather
const { cities } = await rt.search('London', { limit: 5, lang: 'en_GB' });
const weather = await rt.getWeather(cities[0]!.id);
console.log(weather.observation?.latest?.temperature, weather.forecast?.days[0]?.maxTemperature);

// 3. Radar
const product = await rt.findRadarProduct({ latitude: 48.8566, longitude: 2.3522 }, { countryCode: '33' });
const frames = await rt.getRadarFrames(product!.id); // observations + forecasts, sorted by time
const jpeg = await rt.fetchRadarImage(frames.at(-1)!); // Uint8Array
```

## API

### `new RainTodayClient(options?)`

| Option      | Default                       | Description                                          |
| ----------- | ----------------------------- | ---------------------------------------------------- |
| `fetch`     | `globalThis.fetch`            | Custom `fetch` implementation                        |
| `lang`      | `fr_FR`                       | Locale used for country / province names in search   |
| `timeoutMs` | `15000`                       | Per-request timeout (`0` disables it)                |
| `userAgent` | `raintoday-api (+github…)`    | `User-Agent` header (ignored by browsers)            |
| `endpoints` | see `DEFAULT_ENDPOINTS`       | Override base URLs (proxy, tests…)                   |
| `productId` | `de.meteogroup.RainToday`     | Product id sent to the map service                   |

Every method accepts `{ signal }` (`AbortSignal`).

| Method                                                       | Endpoint                                                      | Returns                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------- |
| `search(query, { limit, lang })`                             | `weatherpro/SearchFeed.php`                                   | `{ cities, pois }`                            |
| `lookupAreas({ latitude, longitude })`                       | `AlertsPro/AlertsProPollService.php?method=lookupCoord`       | `Area[]`                                      |
| `lookupAreaId(coords)`                                       | same                                                          | `string \| null`                              |
| `getRainChart(areaId)`                                       | `weatherpro/RainService.php?method=getRainChart`              | `RainChart`                                   |
| `getRainChartAt(coords)`                                     | area lookup + rain chart                                      | `RainChart`                                   |
| `getWeather(locationId, { mode })`                           | `weatherpro/WeatherServiceFeed.php?format=json`               | `Weather`                                     |
| `getRadarProducts()`                                         | `MapService.php?method=getParameters`                         | `RadarProduct[]`                              |
| `findRadarProducts(coords, { countryCode })`                 | same, filtered by coverage                                    | `RadarProduct[]`                              |
| `findRadarProduct(coords, { countryCode })`                  | same, best match                                              | `RadarProduct \| undefined`                   |
| `getRadarFrames(productId)`                                  | `cdn.meteogroup.de/images/mapengine/rain2.0/{id}/images.xml`  | `RadarFrame[]`                                |
| `fetchRadarImage(frame \| url, { kind })`                    | radar JPEG (`image`) or motion field (`velocity`)             | `Uint8Array`                                  |

The parsers (`parseRainChart`, `parseWeatherFeed`, `parseSearchFeed`, `parseRadarProducts`, `parseRadarFrames`, …)
are exported too, so you can process raw responses yourself.

### `RainChart`

A ~60-minute nowcast with one value per minute (`intervalMs = 60000`), starting at `startTime`
(time of the latest radar image, UTC).

- `points[]`: `{ time, offsetMinutes, avg, min, max }`: intensity over the area on the `domain` scale (0–100)
- `hasRain`, `rainStartsInMinutes` / `rainStartsAt`, `rainEndsInMinutes` / `rainEndsAt` (`null` when no rain is expected; `-1` in the raw payload)
- `intensity`, `windDirection`, `precipitationAngle`, `raw`

### `Weather`

- `observation.latest`: `temperature` (°C), `dewPoint`, `windDirection` (°), `windSpeed`, `windGust`,
  `precipitation` (mm), `cloudCover` (octas), `weatherCode` (WMO `ww`), `symbol`, `pressure` (hPa)
- `forecast.days` (daily, with `night` holding the raw `_n` values), `forecast.hours` (3-hour steps), `forecast.intervals` (6-hour steps):
  the same fields plus `maxTemperature`, `minTemperature`, `precipitationProbability` (%), `sunshineHours`, `uvIndex`

Wind speed units are not documented by the API and are passed through as-is.

### Radar

`RadarProduct` describes the image grid (`projection.proj4`, size in pixels, pixel size in metres, origin)
and its coverage (`area.bounds`). To turn a pixel into coordinates, use e.g. [`proj4`](https://www.npmjs.com/package/proj4)
with `projection.proj4`: `x = offsetX + col * pixelWidthMeters`, `y = offsetY + row * pixelHeightMeters` (check this against the product you use).

Several radars can cover the same point (e.g. CH and FR near the border). Pass `countryCode`
(same code as `Location.countryCode`, e.g. `33` for France, `44` for the UK) to prefer the right one.
Without it, the smallest covering area wins.

Available products: `rad_de` (Germany), `rad_uk` (UK & Ireland), `rad_nl` (Netherlands), `rad_ch` (Switzerland), `rad_fr` (France).

### Errors

- `RainTodayHttpError`: non-2xx response (`status`, `url`, `body`)
- `RainTodayNotFoundError`: unknown area, coordinates outside coverage, location without data
- `RainTodayParseError`: unexpected payload
- `RainTodayError`: base class (network errors, timeouts…)

## Development

```bash
npm install
npm test           # unit tests (recorded fixtures)
npm run test:live  # tests against the real APIs
npm run typecheck
npm run build
```

## Contributing

Issues and pull requests are welcome. These APIs are undocumented and were reverse-engineered from the app's
network traffic. If you find a new endpoint, parameter or field, please open an issue with a sample response.

## Disclaimer

This project is not affiliated with, endorsed by or supported by MeteoGroup, DTN or the RainToday app.
The APIs are not publicly documented and may change or disappear without notice.
Respect the service's terms of use and avoid excessive requests.

## License

[MIT](./LICENSE)
