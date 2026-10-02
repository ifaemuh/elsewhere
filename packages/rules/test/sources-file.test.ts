import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSources } from '../src/load';

const sources = loadSources();

test('sources.yaml loads and every source is https', () => {
  for (const source of Object.values(sources)) assert.ok(source.url.startsWith('https://'), source.key);
});

test('the sources the first ten rules need are tracked', () => {
  for (const key of ['ecfr-14-cfr-250', 'ecfr-14-cfr-259', 'ecfr-14-cfr-260', 'youreurope-air-passenger-rights']) {
    assert.ok(sources[key], key);
  }
});

test('regulations are tracked through the eCFR API, not page scraping', () => {
  for (const source of Object.values(sources)) {
    if (source.url.startsWith('https://www.ecfr.gov/')) assert.ok('ecfr' in source.detector, source.key);
  }
});
