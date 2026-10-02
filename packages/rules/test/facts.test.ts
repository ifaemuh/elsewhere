import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTS, FactValueError, validateSituation } from '../src/facts';

test('every enum fact declares its values', () => {
  for (const [name, def] of Object.entries(FACTS)) {
    if (def.type === 'enum') assert.ok('values' in def && def.values.length > 0, name);
  }
});

test('validateSituation accepts well-typed facts and skips undefined', () => {
  validateSituation({
    'event.type': 'cancellation',
    'event.delay_minutes': 200,
    'flight.touches_us': true,
    'flight.carrier_iata': 'DL',
    'event.cause': undefined,
  });
});

test('validateSituation rejects unknown facts', () => {
  assert.throws(() => validateSituation({ 'flight.color': 'red' } as never), FactValueError);
});

test('validateSituation rejects values outside an enum', () => {
  assert.throws(() => validateSituation({ 'event.type': 'meteor' }), /expects one of cancellation/);
});

test('validateSituation rejects wrong primitive types', () => {
  assert.throws(() => validateSituation({ 'event.delay_minutes': '180' }), /expects a number/);
  assert.throws(() => validateSituation({ 'flight.touches_us': 'yes' }), /expects a boolean/);
  assert.throws(() => validateSituation({ 'event.delay_minutes': Number.NaN }), /expects a number/);
});

test('the departure and duration facts exist', () => {
  validateSituation({ 'flight.departs_us': true, 'trip.us_foreign_nonstop_minutes': 780 });
  assert.throws(() => validateSituation({ 'trip.us_foreign_nonstop_minutes': '13h' }), /expects a number/);
});

test('the EU261 rerouting, departure delay, leg distance and journey facts exist', () => {
  validateSituation({
    'event.reroute_departs_early_minutes': 60,
    'event.reroute_arrival_delay_minutes': 120,
    'event.departure_delay_minutes': 240,
    'event.departure_moved_earlier_minutes': 61,
    'flight.leg_distance_km': 1500,
    'flight.departs_iceland_norway_switzerland': true,
    'trip.journey_departs_eu': true,
    'trip.journey_arrives_eu': false,
  });
  assert.throws(() => validateSituation({ 'trip.journey_departs_eu': 'yes' }), /expects a boolean/);
  assert.throws(() => validateSituation({ 'event.departure_delay_minutes': '4h' }), /expects a number/);
});
