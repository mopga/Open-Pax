/**
 * Unit-тесты резолвера имён ("ИИ по именам, движок по id").
 */
import { describe, it, expect } from 'vitest';
import { normalizeName, RegionResolver, PolityResolver } from '../src/utils/name-resolver';

const regions = [
  { id: 'w1_DEU', name: 'ФРГ', owner: 'DEU', color: '#FF0000' },
  { id: 'w1_POL', name: 'Польша', owner: 'POL', color: '#00FF00' },
  { id: 'w1_CZE', name: 'Чехословакия', owner: 'CZE', color: '#0000FF' },
  { id: 'w1_SOV', name: 'Советский Союз', owner: 'SOV', color: '#CC0000' },
];

describe('normalizeName', () => {
  it('нормализует регистр, кавычки и скобки', () => {
    expect(normalizeName('«Польша»')).toBe('польша');
    expect(normalizeName('  ПОЛЬША  ')).toBe('польша');
    expect(normalizeName('"Советский Союз"')).toBe('советский союз');
    expect(normalizeName('[POL]')).toBe('pol');
    expect(normalizeName('ФРГ (Германия)')).toBe('фрг');
  });
});

describe('RegionResolver', () => {
  const resolver = new RegionResolver(regions);

  it('точное совпадение', () => {
    expect(resolver.resolve('Польша')?.id).toBe('w1_POL');
  });

  it('без учёта регистра и кавычек', () => {
    expect(resolver.resolve('«польша»')?.id).toBe('w1_POL');
  });

  it('префикс/подстрока', () => {
    expect(resolver.resolve('Советский')?.id).toBe('w1_SOV');
    expect(resolver.resolve('Чехословакия!')?.id).toBe('w1_CZE');
  });

  it('неизвестный регион → undefined', () => {
    expect(resolver.resolve('Атлантида')).toBeUndefined();
    expect(resolver.resolve(undefined)).toBeUndefined();
  });
});

describe('PolityResolver', () => {
  const resolver = new PolityResolver(regions, 'DEU');

  it('по отображаемому имени', () => {
    expect(resolver.resolve('Польша')).toEqual({ polityId: 'POL', isNew: false });
  });

  it('по коду политии', () => {
    expect(resolver.resolve('CZE')).toEqual({ polityId: 'CZE', isNew: false });
  });

  it('алиасы игрока', () => {
    expect(resolver.resolve('player')?.polityId).toBe('DEU');
    expect(resolver.resolve('игрок')?.polityId).toBe('DEU');
    expect(resolver.resolve('ФРГ')?.polityId).toBe('DEU');
  });

  it('новая полития создаётся по имени', () => {
    const res = resolver.resolve('Варшавский блок');
    expect(res?.isNew).toBe(true);
    expect(res?.polityId).toBe('Варшавский блок');
  });

  it('colorOf возвращает цвет существующей политии', () => {
    expect(resolver.colorOf('SOV')).toBe('#CC0000');
    expect(resolver.colorOf('Атлантида')).toBeUndefined();
  });
});
