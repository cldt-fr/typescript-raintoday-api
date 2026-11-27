import { describe, expect, it, vi } from 'vitest';
import { RainTodayClient, RainTodayHttpError, RainTodayNotFoundError } from '../src/index.js';
import { fixture } from './helpers.js';

function mockFetch(routes: Record<string, string | (() => Response)>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) return typeof body === 'function' ? body() : new Response(body);
    }
    return new Response('not found', { status: 404 });
  });
  return { fetch: fn, calls };
}

describe('RainTodayClient', () => {
  it('searches locations with encoded query', async () => {
    const { fetch, calls } = mockFetch({ 'SearchFeed.php': fixture('search.xml') });
    const rt = new RainTodayClient({ fetch });
    const r = await rt.search('Le Mans', { limit: 5 });
    expect(r.cities[0]!.name).toBe('Paris');
    expect(calls[0]).toBe(
      'https://weatherpro.consumer.meteogroup.com/weatherpro/SearchFeed.php?search=Le%20Mans&limit=5&lang=fr_FR',
    );
  });

  it('gets the rain chart from coordinates', async () => {
    const { fetch, calls } = mockFetch({
      'lookupCoord': fixture('lookup.json'),
      'getRainChart': fixture('rainchart.json'),
    });
    const rt = new RainTodayClient({ fetch });
    const chart = await rt.getRainChartAt({ latitude: 48.85, longitude: 2.35 });
    expect(chart.areaId).toBe('UWZFR4916');
    expect(calls[0]).toContain('method=lookupCoord&lat=48.85&lon=2.35');
    expect(calls[1]).toContain('RainService.php?method=getRainChart&areaID=UWZFR4916');
  });

  it('throws NotFound outside coverage or for unknown areas', async () => {
    const { fetch } = mockFetch({ lookupCoord: '[]', getRainChart: 'null' });
    const rt = new RainTodayClient({ fetch });
    await expect(rt.getRainChartAt({ latitude: 40.7, longitude: -74 })).rejects.toBeInstanceOf(RainTodayNotFoundError);
    await expect(rt.getRainChart('BOGUS')).rejects.toBeInstanceOf(RainTodayNotFoundError);
  });

  it('gets the weather in JSON format', async () => {
    const { fetch, calls } = mockFetch({ WeatherServiceFeed: fixture('weather.json') });
    const w = await new RainTodayClient({ fetch }).getWeather(1841939);
    expect(w.locationId).toBe('1841939');
    expect(w.forecast?.days.length).toBeGreaterThan(0);
    expect(calls[0]).toContain('format=json&lid=1841939&mode=forecast');
  });

  it('finds the radar product, preferring the country', async () => {
    const { fetch } = mockFetch({ 'MapService.php': fixture('parameters.xml') });
    const rt = new RainTodayClient({ fetch });
    // Annecy area is covered by both CH and FR radars.
    const coords = { latitude: 45.9, longitude: 6.12 };
    expect((await rt.findRadarProducts(coords)).map((p) => p.id)).toEqual(['rad_ch', 'rad_fr']);
    expect((await rt.findRadarProduct(coords, { countryCode: '33' }))?.id).toBe('rad_fr');
    expect(await rt.findRadarProduct({ latitude: 40.7, longitude: -74 })).toBeUndefined();
  });

  it('lists radar frames and downloads images', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const { fetch, calls } = mockFetch({
      'rad_fr/images.xml': fixture('images.xml'),
      '.jpg': () => new Response(jpeg),
    });
    const rt = new RainTodayClient({ fetch });
    const frames = await rt.getRadarFrames('rad_fr');
    expect(calls[0]).toBe('https://cdn.meteogroup.de/images/mapengine/rain2.0/rad_fr/images.xml');
    const bytes = await rt.fetchRadarImage(frames[0]!);
    expect(Array.from(bytes)).toEqual(Array.from(jpeg));
    expect(calls[1]).toBe(frames[0]!.imageUrl);
  });

  it('wraps HTTP errors', async () => {
    const { fetch } = mockFetch({ 'SearchFeed.php': () => new Response('boom', { status: 503 }) });
    const err = await new RainTodayClient({ fetch }).search('x').catch((e) => e);
    expect(err).toBeInstanceOf(RainTodayHttpError);
    expect(err.status).toBe(503);
  });
});
