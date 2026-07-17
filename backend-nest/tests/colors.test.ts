/**
 * Цвета карты:
 *  - анти-тёмный post-process (чёрные/тёмные цвета флагов осветляются,
 *    чтобы регион читался на тёмной карте #0a0a0f);
 *  - приоритет кураторской палитры пресета (country_colors);
 *  - валидация country_colors в preset.json.
 */
import { describe, it, expect } from 'vitest';
import {
  relativeLuminance,
  lighten,
  ensureVisibleOnDark,
  resolveRegionColor,
  normalizeHexColor,
  DARK_LUMINANCE_THRESHOLD,
} from '../src/utils/color';
import { validatePresetJson } from '../src/utils/preset-loader';

describe('relativeLuminance', () => {
  it('чёрный = 0, белый = 1, чистый красный = 0.2126', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#FF0000')).toBeCloseTo(0.2126, 4);
  });

  it('поддерживает короткий #RGB и lowercase', () => {
    expect(relativeLuminance('#000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('невалидный ввод → null', () => {
    expect(relativeLuminance('red')).toBeNull();
    expect(relativeLuminance('')).toBeNull();
    expect(relativeLuminance('#12345')).toBeNull();
  });
});

describe('lighten', () => {
  it('чёрный + 45% белого → #737373', () => {
    expect(lighten('#000000', 0.45)).toBe('#737373');
  });

  it('белый остаётся белым', () => {
    expect(lighten('#FFFFFF', 0.45)).toBe('#FFFFFF');
  });
});

describe('ensureVisibleOnDark (анти-тёмный post-process)', () => {
  it('чёрный осветляется выше порога яркости', () => {
    const fixed = ensureVisibleOnDark('#000000');
    expect(fixed).not.toBe('#000000');
    expect(relativeLuminance(fixed)!).toBeGreaterThanOrEqual(DARK_LUMINANCE_THRESHOLD);
  });

  it('тёмно-синий (#000033) осветляется до читаемого', () => {
    const fixed = ensureVisibleOnDark('#000033');
    expect(relativeLuminance(fixed)!).toBeGreaterThanOrEqual(DARK_LUMINANCE_THRESHOLD);
  });

  it('цвет выше порога не меняется (нормализуется)', () => {
    // кирпичный СССР: яркость ~0.33 > 0.18
    expect(ensureVisibleOnDark('#a83a32')).toBe('#A83A32');
  });

  it('невалидный ввод → нейтральный #888888', () => {
    expect(ensureVisibleOnDark('not-a-color')).toBe('#888888');
  });
});

describe('resolveRegionColor (приоритет палитры пресета)', () => {
  it('цвет из country_colors пресета выигрывает, post-process не применяется', () => {
    // Даже «тёмный» кураторский цвет возвращается как есть — куратору виднее
    expect(resolveRegionColor('RUS', '#FF0000', { RUS: '#A83A32' })).toBe('#A83A32');
  });

  it('кода нет в палитре → прежний цвет + анти-тёмный post-process', () => {
    const fixed = resolveRegionColor('DEU', '#000000', { RUS: '#A83A32' });
    expect(fixed).toBe('#737373');
  });

  it('без палитры обычный цвет сохраняется', () => {
    expect(resolveRegionColor('FRA', '#5B7FC4')).toBe('#5B7FC4');
  });

  it('битый кураторский цвет игнорируется, работает fallback', () => {
    expect(resolveRegionColor('USA', '#5B7FC4', { USA: 'oops' })).toBe('#5B7FC4');
  });

  it('битый fallback → #888888', () => {
    expect(resolveRegionColor('USA', 'oops')).toBe('#888888');
  });
});

describe('preset.json: country_colors', () => {
  const basePreset = {
    id: 'test_preset',
    name: 'Test',
    country_codes: ['USA', 'RUS'],
    base_prompt: 'Тестовый мир',
  };

  it('валидная палитра принимается и пробрасывается', () => {
    const p = validatePresetJson({ ...basePreset, country_colors: { USA: '#8FB3D9', RUS: '#A83A32' } });
    expect(p.country_colors).toEqual({ USA: '#8FB3D9', RUS: '#A83A32' });
  });

  it('секция отсутствует — не ломает дефолт', () => {
    const p = validatePresetJson(basePreset);
    expect(p.country_colors).toBeUndefined();
  });

  it('невалидный цвет отклоняется', () => {
    expect(() => validatePresetJson({ ...basePreset, country_colors: { USA: 'blue' } })).toThrow(/country_colors/);
  });

  it('невалидный код страны отклоняется', () => {
    expect(() => validatePresetJson({ ...basePreset, country_colors: { usa: '#8FB3D9' } })).toThrow(/country_colors/);
  });

  it('country_colors — не массив', () => {
    expect(() => validatePresetJson({ ...basePreset, country_colors: ['#8FB3D9'] })).toThrow(/country_colors/);
  });

  it('normalizeHexColor: #abc → #AABBCC', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
  });
});
