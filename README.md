# raintoday-api

Client TypeScript **non officiel** pour les API utilisées par l'application **RainToday** (MeteoGroup / WeatherPro) :
prévision de pluie minute par minute, images radar, prévisions météo et recherche de lieux.

- Aucune dépendance runtime, utilise `fetch` (Node ≥ 18, Deno, Bun, navigateurs*)
- ESM + CommonJS, typages complets
- Réponses normalisées (dates en `Date`, noms de champs lisibles) avec accès au `raw`

> \* Les serveurs MeteoGroup n'envoient pas tous d'en-têtes CORS : dans un navigateur, passez par un proxy (`endpoints`).

## Installation

```bash
npm install github:cldt-fr/typescript-raintoday-api
```

## Exemple rapide

```ts
import { RainTodayClient } from 'raintoday-api';

const rt = new RainTodayClient();

// 1. Pluie dans l'heure à des coordonnées
const chart = await rt.getRainChartAt({ latitude: 48.8566, longitude: 2.3522 });
if (chart.hasRain) {
  console.log(`Pluie à ${chart.rainStartsAt?.toLocaleTimeString()} jusqu'à ${chart.rainEndsAt?.toLocaleTimeString()}`);
}
for (const p of chart.points) console.log(p.time.toISOString(), p.avg, p.min, p.max);

// 2. Recherche d'un lieu + météo
const { cities } = await rt.search('Lyon', { limit: 5 });
const weather = await rt.getWeather(cities[0]!.id);
console.log(weather.observation?.latest?.temperature, weather.forecast?.days[0]?.maxTemperature);

// 3. Radar
const product = await rt.findRadarProduct({ latitude: 48.8566, longitude: 2.3522 }, { countryCode: '33' });
const frames = await rt.getRadarFrames(product!.id); // observations + prévisions, triées
const jpeg = await rt.fetchRadarImage(frames.at(-1)!); // Uint8Array
```

## API

### `new RainTodayClient(options?)`

| Option      | Défaut                       | Description                                              |
| ----------- | ---------------------------- | -------------------------------------------------------- |
| `fetch`     | `globalThis.fetch`           | Implémentation `fetch` personnalisée                     |
| `lang`      | `fr_FR`                      | Langue des noms de pays / régions dans la recherche      |
| `timeoutMs` | `15000`                      | Timeout par requête (`0` pour désactiver)                |
| `userAgent` | `raintoday-api (+github…)`   | En-tête `User-Agent`                                     |
| `endpoints` | voir `DEFAULT_ENDPOINTS`     | Surcharge des URLs de base (proxy, tests…)               |
| `productId` | `de.meteogroup.RainToday`    | Identifiant produit envoyé au MapService                 |

Toutes les méthodes acceptent `{ signal }` (`AbortSignal`).

| Méthode                                   | Endpoint                                                         | Retour             |
| ----------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| `search(query, { limit, lang })`          | `weatherpro/SearchFeed.php`                                      | `{ cities, pois }` |
| `lookupAreas({ latitude, longitude })`    | `AlertsPro/AlertsProPollService.php?method=lookupCoord`          | `Area[]`           |
| `lookupAreaId(coords)`                    | idem                                                             | `string \| null`   |
| `getRainChart(areaId)`                    | `weatherpro/RainService.php?method=getRainChart`                 | `RainChart`        |
| `getRainChartAt(coords)`                  | lookup + rain chart                                              | `RainChart`        |
| `getWeather(locationId, { mode })`        | `weatherpro/WeatherServiceFeed.php?format=json`                  | `Weather`          |
| `getRadarProducts()`                      | `MapService.php?method=getParameters`                            | `RadarProduct[]`   |
| `findRadarProducts(coords, { countryCode })` / `findRadarProduct(...)` | idem, filtré par couverture         | `RadarProduct[]` / `RadarProduct \| undefined` |
| `getRadarFrames(productId)`               | `cdn.meteogroup.de/images/mapengine/rain2.0/{id}/images.xml`     | `RadarFrame[]`     |
| `fetchRadarImage(frame \| url, { kind })` | JPEG radar (`image`) ou champ de déplacement (`velocity`)        | `Uint8Array`       |

Les parseurs (`parseRainChart`, `parseWeatherFeed`, `parseSearchFeed`, …) sont aussi exportés pour traiter des réponses brutes.

### `RainChart`

Prévision « nowcast » sur ~60 minutes, une valeur par minute (`intervalMs = 60000`) à partir de `startTime`
(heure de la dernière image radar, UTC).

- `points[]` : `{ time, offsetMinutes, avg, min, max }` — intensité sur l'échelle `domain` (0–100) pour la zone
- `hasRain`, `rainStartsInMinutes` / `rainStartsAt`, `rainEndsInMinutes` / `rainEndsAt` (`null` si pas de pluie, `-1` côté API)
- `intensity`, `windDirection`, `precipitationAngle`, `raw`

### `Weather`

- `observation.latest` : `temperature` (°C), `dewPoint`, `windDirection` (°), `windSpeed`, `windGust`,
  `precipitation` (mm), `cloudCover` (octas), `weatherCode` (WMO `ww`), `symbol`, `pressure` (hPa)
- `forecast.days` (journalier, avec `night` pour les valeurs `_n`), `forecast.hours` (pas de 3 h), `forecast.intervals` (pas de 6 h) :
  mêmes champs + `maxTemperature`, `minTemperature`, `precipitationProbability` (%), `sunshineHours`, `uvIndex`

### Radar

`RadarProduct` décrit la grille de l'image (`projection.proj4`, taille en pixels, taille d'un pixel en mètres, origine)
et sa couverture (`area.bounds`). Pour convertir un pixel en coordonnées, utilisez par exemple [`proj4`](https://www.npmjs.com/package/proj4)
avec `projection.proj4` : `x = offsetX + col * pixelWidthMeters`, `y = offsetY + row * pixelHeightMeters` (à valider selon le produit).

Plusieurs radars peuvent couvrir un même point (ex. CH et FR près de la frontière) : passez `countryCode`
(même code que `Location.countryCode`, ex. `33` pour la France) pour privilégier le bon.

### Erreurs

- `RainTodayHttpError` (`status`, `url`, `body`)
- `RainTodayNotFoundError` : zone inconnue, coordonnées hors couverture, lieu sans données
- `RainTodayParseError` : réponse inattendue
- `RainTodayError` : classe de base (erreurs réseau, timeout…)

## Développement

```bash
npm install
npm test           # tests unitaires (fixtures)
npm run test:live  # tests contre les vraies API
npm run build
```

## Avertissement

Ce projet n'est ni affilié ni approuvé par MeteoGroup / DTN. Les API ne sont pas documentées publiquement
et peuvent changer sans préavis. Respectez les conditions d'utilisation du service et évitez les appels excessifs.
