import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

/** A rainy chart (synthetic) to exercise rain start/end handling. */
export const rainyChart = {
  precAngle: 250,
  domainMax: 100,
  domainMin: 0,
  avg: Array.from({ length: 61 }, (_, i) => (i >= 10 && i < 40 ? 30 : 0)),
  min: Array.from({ length: 61 }, (_, i) => (i >= 10 && i < 40 ? 10 : 0)),
  max: Array.from({ length: 61 }, (_, i) => (i >= 10 && i < 40 ? 55 : 0)),
  startMin: 10,
  endMin: 40,
  intensity: 2,
  uwzid: 'UWZFR4916',
  winddir: '250',
  startdtg: '2026-11-27 08:20:00',
  creationdtg: '2026-11-27 08:25:28',
  interval: '60000',
};
