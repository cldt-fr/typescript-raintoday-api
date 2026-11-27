import { describe, expect, it } from 'vitest';
import { RainTodayClient } from '../src/index.js';

const live = process.env.RAINTODAY_LIVE ? describe : describe.skip;

live('live API', () => {
  const rt = new RainTodayClient();
  const paris = { latitude: 48.8566, longitude: 2.3522 };

  it('search', async () => {
    const r = await rt.search('Paris', { limit: 3 });
    expect(r.cities[0]?.name).toBe('Paris');
  });

  it('rain chart', async () => {
    const c = await rt.getRainChartAt(paris);
    expect(c.points.length).toBeGreaterThan(30);
  });

  it('weather', async () => {
    const w = await rt.getWeather('1841939');
    expect(w.forecast?.days.length).toBeGreaterThan(0);
  });

  it('radar', async () => {
    const product = await rt.findRadarProduct(paris, { countryCode: '33' });
    expect(product?.id).toBe('rad_fr');
    const frames = await rt.getRadarFrames(product!.id);
    const img = await rt.fetchRadarImage(frames[0]!);
    expect(img[0]).toBe(0xff);
  });
});
