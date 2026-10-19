import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildBorderEdges, buildPolityLabels, chainSegments, muteColor, parseRegionFeatures, project, unproject,
  type MapRegionInput, type Position,
} from './mapData';

// Реальная геометрия стран (Natural Earth), которую backend отдаёт в регионах
const COUNTRIES = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../../../backend-nest/data/geojson/countries.geojson'), 'utf8',
));

function regionsFor(codes: string[], owners: Record<string, string> = {}): MapRegionInput[] {
  return COUNTRIES.features
    .filter((f: any) => codes.includes(f.properties.code))
    .map((f: any) => ({
      id: `w_${f.properties.code}`,
      name: f.properties.nameEn,
      owner: owners[f.properties.code] ?? f.properties.code,
      geojson: JSON.stringify(f),
    }));
}

describe('project / unproject', () => {
  it('взаимно обратны', () => {
    for (const p of [[0, 0], [37.6, 55.75], [-120, -40]] as Position[]) {
      const back = unproject(project(p));
      expect(back[0]).toBeCloseTo(p[0], 6);
      expect(back[1]).toBeCloseTo(p[1], 6);
    }
  });
});

describe('buildBorderEdges', () => {
  it('находит общую границу Франции и Испании и берега', () => {
    const features = parseRegionFeatures(regionsFor(['FRA', 'ESP', 'PRT']));
    const edges = buildBorderEdges(features);
    const pairs = edges.filter(e => e.b).map(e => [e.a, e.b].join('|'));
    expect(pairs).toContain('w_ESP|w_FRA');
    expect(pairs).toContain('w_ESP|w_PRT');
    expect(pairs).not.toContain('w_FRA|w_PRT');
    // У каждой страны есть берег
    for (const id of ['w_FRA', 'w_ESP', 'w_PRT']) {
      expect(edges.some(e => e.a === id && e.b === null)).toBe(true);
    }
  });

  it('склеивает отрезки в непрерывные линии', () => {
    const lines = chainSegments([
      [[0, 0], [1, 0]],
      [[2, 0], [1, 0]],
      [[2, 0], [3, 1]],
      [[10, 10], [11, 10]],
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.map(l => l.length).sort()).toEqual([2, 4]);
  });
});

describe('buildPolityLabels', () => {
  it('одна подпись на государство; крупные страны крупнее и видны раньше', () => {
    const regions = regionsFor(['RUS', 'BEL', 'FRA']);
    const labels = buildPolityLabels(regions, parseRegionFeatures(regions), o => o);
    const rus = labels.filter(l => l.owner === 'RUS');
    const bel = labels.find(l => l.owner === 'BEL')!;
    expect(rus.length).toBeGreaterThanOrEqual(1);
    expect(rus[0].size0).toBeGreaterThan(bel.size0);
    expect(rus[0].minZoom).toBeLessThan(bel.minZoom);
    // Точка подписи России — внутри страны (а не в океане)
    expect(rus[0].point[0]).toBeGreaterThan(30);
    expect(rus[0].point[1]).toBeGreaterThan(45);
  });

  it('аннексия: регион передаёт владение — подпись у нового владельца', () => {
    const regions = regionsFor(['FRA', 'BEL'], { BEL: 'FRA' });
    const labels = buildPolityLabels(regions, parseRegionFeatures(regions), o => (o === 'FRA' ? 'France' : o));
    expect(labels.some(l => l.owner === 'BEL')).toBe(false);
    expect(labels.filter(l => l.owner === 'FRA').every(l => l.name === 'France')).toBe(true);
  });
});

describe('muteColor', () => {
  it('гасит кислотные цвета, но сохраняет тон и не трогает спокойные', () => {
    expect(muteColor('#ff0000')).toBe('#c63939');
    expect(muteColor('#000080')).not.toBe('#000080');
    expect(muteColor('#7a8a6a')).toBe('#7a8a6a');
    expect(muteColor('nonsense')).toBe('nonsense');
  });
});

describe('labelLineForPart / линии меток', () => {
  const labelOf = (code: string) => {
    const regions = regionsFor([code]);
    return buildPolityLabels(regions, parseRegionFeatures(regions), o => o)
      .sort((a, b) => b.area0 - a.area0)[0];
  };
  /** Угол линии от горизонтали, градусы (в пикселях Меркатора) */
  const angleOf = (line: Position[]) => {
    const [x0, y0] = project(line[0]);
    const [x1, y1] = project(line[line.length - 1]);
    return Math.abs((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI);
  };

  it('Чили — почти вертикальная линия вдоль страны', () => {
    const chile = labelOf('CHL');
    const a = angleOf(chile.line);
    expect(Math.min(a, 180 - a)).toBeGreaterThan(70);
  });

  it('Россия — длинная, близкая к горизонтали; середина линии внутри страны', () => {
    const rus = labelOf('RUS');
    const a = angleOf(rus.line);
    expect(Math.min(a, 180 - a)).toBeLessThan(25);
    expect(rus.point[0]).toBeGreaterThan(40);
    expect(rus.point[0]).toBeLessThan(140);
    expect(rus.point[1]).toBeGreaterThan(50);
    expect(rus.point[1]).toBeLessThan(72);
  });

  it('почти круглая страна получает горизонтальную линию', () => {
    const fra = labelOf('FRA');
    const a = angleOf(fra.line);
    expect(Math.min(a, 180 - a)).toBeLessThan(15);
  });

  it('линия плавная (17 точек) и разрядка в разумных пределах', () => {
    for (const code of ['RUS', 'BRA', 'EGY']) {
      const l = labelOf(code);
      expect(l.line).toHaveLength(17);
      expect(l.letterSpacing).toBeGreaterThanOrEqual(0.25);
      expect(l.letterSpacing).toBeLessThanOrEqual(1.4);
    }
  });
});
