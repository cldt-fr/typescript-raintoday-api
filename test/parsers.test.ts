import { describe, expect, it } from 'vitest';
import {
  parseAreaLookup,
  parseDate,
  parseRadarFrames,
  parseRadarProducts,
  parseRainChart,
  parseSearchFeed,
  parseWeatherFeed,
  productCovers,
} from '../src/index.js';
import { fixture, rainyChart } from './helpers.js';

describe('parseDate', () => {
  it('parses SQL-like UTC dates and ISO offsets', () => {
    expect(parseDate('2026-11-27 08:20:00').toISOString()).toBe('2026-11-27T08:20:00.000Z');
    expect(parseDate('2026-11-27T07:25:00+0000').toISOString()).toBe('2026-11-27T07:25:00.000Z');
    expect(parseDate('2026-11-27T08:00:00+00:00').toISOString()).toBe('2026-11-27T08:00:00.000Z');
    expect(() => parseDate('nope')).toThrow();
  });
});

describe('parseSearchFeed', () => {
  it('parses cities and pois', () => {
    const r = parseSearchFeed(fixture('search.xml'));
    expect(r.cities[0]).toMatchObject({
      kind: 'city',
      id: '1841939',
      name: 'Paris',
      countryCode: '33',
      countryName: 'France',
      provinceName: 'Ile-de-France',
      timezone: 'Europe/Paris',
      latitude: 48.866667,
      longitude: 2.333333,
      inhabitants: 2200000,
    });
    expect(r.pois.length).toBeGreaterThan(0);
    expect(r.pois[0]!.kind).toBe('poi');
    expect(r.pois[0]!.name).toBe('Pärispea Poolsaar');
  });

  it('handles empty results', () => {
    expect(parseSearchFeed('<result><cities previousOffset="-1" nextOffset="-1"/></result>')).toEqual({
      cities: [],
      pois: [],
    });
  });
});

describe('parseAreaLookup', () => {
  it('maps areas', () => {
    expect(parseAreaLookup(JSON.parse(fixture('lookup.json')))).toEqual([
      { type: 'UWZ', id: 'UWZFR4916', centerId: '2' },
    ]);
    expect(parseAreaLookup([])).toEqual([]);
    expect(parseAreaLookup(null)).toEqual([]);
  });
});

describe('parseRainChart', () => {
  it('parses a dry chart', () => {
    const c = parseRainChart(JSON.parse(fixture('rainchart.json')));
    expect(c.areaId).toBe('UWZFR4916');
    expect(c.points).toHaveLength(61);
    expect(c.intervalMs).toBe(60_000);
    expect(c.points[1]!.time.getTime() - c.points[0]!.time.getTime()).toBe(60_000);
    expect(c.hasRain).toBe(false);
    expect(c.rainStartsInMinutes).toBeNull();
    expect(c.rainStartsAt).toBeNull();
    expect(c.intensity).toBeNull();
  });

  it('parses a rainy chart', () => {
    const c = parseRainChart(rainyChart);
    expect(c.hasRain).toBe(true);
    expect(c.rainStartsInMinutes).toBe(10);
    expect(c.rainEndsInMinutes).toBe(40);
    expect(c.rainStartsAt?.toISOString()).toBe('2026-11-27T08:30:00.000Z');
    expect(c.rainEndsAt?.toISOString()).toBe('2026-11-27T09:00:00.000Z');
    expect(c.points[15]).toMatchObject({ offsetMinutes: 15, avg: 30, min: 10, max: 55 });
    expect(c.windDirection).toBe(250);
    expect(c.intensity).toBe(2);
  });
});

describe('parseWeatherFeed', () => {
  it('normalizes observation and forecast', () => {
    const w = parseWeatherFeed(JSON.parse(fixture('weather.json')), '1841939');
    expect(w.observation?.latest?.time).toBeInstanceOf(Date);
    expect(typeof w.observation?.latest?.temperature).toBe('number');
    expect(w.forecast?.days.length).toBeGreaterThan(0);
    expect(w.forecast?.hours.length).toBeGreaterThan(0);
    expect(w.forecast?.intervals.length).toBeGreaterThan(0);
    const day = w.forecast!.days[0]!;
    expect(day.maxTemperature).toBeTypeOf('number');
    expect(day.minTemperature).toBeTypeOf('number');
    expect(day.intervalSeconds).toBe(3600);
    expect(day.night).toBeDefined();
    expect(w.forecast!.hours[0]!.intervalSeconds).toBe(10800);
  });

  it('accepts single objects instead of arrays', () => {
    const w = parseWeatherFeed(
      { observation: { obse: { obs: { dtg: '2026-11-27T08:00:00+00:00', tt: 4.2, rrrh: 1 } }, stationId: 1 } },
      '1',
    );
    expect(w.observation?.entries).toHaveLength(1);
    expect(w.observation?.latest).toMatchObject({ temperature: 4.2, precipitationPeriodHours: 1 });
    expect(w.forecast).toBeUndefined();
  });
});

describe('radar', () => {
  it('parses radar products', () => {
    const products = parseRadarProducts(fixture('parameters.xml'));
    expect(products.map((p) => p.id)).toEqual(['rad_de', 'rad_uk', 'rad_nl', 'rad_ch', 'rad_fr']);
    const fr = products.find((p) => p.id === 'rad_fr')!;
    expect(fr.projection).toMatchObject({ width: 790, height: 724, velocityScale: 8 });
    expect(fr.projection.proj4).toContain('+proj=stere');
    expect(fr.area.bounds).toEqual({ north: 53.467973, south: 39.792072, east: 13.734322, west: -9.518992 });
    expect(fr.countries).toEqual([{ code: '33' }]);
    expect(products.find((p) => p.id === 'rad_uk')!.countries).toEqual([
      { code: '44', name: 'UK' },
      { code: '353', name: 'Ireland' },
    ]);
    expect(productCovers(fr, 48.85, 2.35)).toBe(true);
    expect(productCovers(fr, 40.7, -74)).toBe(false);
  });

  it('parses radar frames', () => {
    const frames = parseRadarFrames(fixture('images.xml'), 'https://cdn.example/rain2.0/', 'x');
    expect(frames.length).toBeGreaterThan(10);
    expect(frames[0]!.productId).toBe('rad_fr');
    expect(frames[0]!.imageUrl).toMatch(/^https:\/\/cdn\.example\/rain2\.0\/rad_fr\/observation\/rad_\d{12}\.jpg$/);
    expect(frames.some((f) => f.isForecast)).toBe(true);
    expect(frames.some((f) => !f.isForecast)).toBe(true);
    const last = frames[frames.length - 1]!;
    expect(last.isForecast).toBe(true);
    for (let i = 1; i < frames.length; i++) expect(frames[i]!.time >= frames[i - 1]!.time).toBe(true);
    expect(frames.every((f) => f.velocityUrl === null || f.velocityUrl.endsWith('.jpg'))).toBe(true);
  });
});
