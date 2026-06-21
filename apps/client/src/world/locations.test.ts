import { describe, expect, it } from 'vitest';
import { locationForPosition } from './locations';

describe('world locations', () => {
  it('maps the bar sectors to readable screen names', () => {
    expect(locationForPosition({ x: 9, y: 14 }).name).toBe('Bar interno');
    expect(locationForPosition({ x: 9, y: 27 }).name).toBe('Bar giardino');
  });

  it('maps village expansion sectors to distinct locations', () => {
    expect(locationForPosition({ x: 30, y: 30 }).name).toBe('Piazza del paese');
    expect(locationForPosition({ x: 32, y: 10 }).name).toBe('Via delle botteghe');
    expect(locationForPosition({ x: 54, y: 14 }).name).toBe('Lungocanale');
    expect(locationForPosition({ x: 56, y: 32 }).name).toBe('Quartiere residenziale');
  });
});
