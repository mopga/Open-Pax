/**
 * Пресет v2: мир собирается из данных пресета без вызовов ИИ.
 *   - каталог государств: государства пресета + все страны карты, страны-члены
 *     не показываются отдельно, рекомендуемые первыми;
 *   - сборка мира «Холодной войны» на настоящем regions.geojson: СССР и
 *     Югославия из стран-членов, столица составного государства, цвета;
 *   - своя карта пресета (map.geojson): одна фича = один регион.
 */
import { describe, it, expect } from 'vitest';
import { loadPreset, validatePresetJson } from '../src/utils/preset-loader';
import { getCapitals, getCountryInfo, getRegionFeatures } from '../src/utils/geodata';
import { buildPolityCatalog, buildPresetWorld, presetMapCodes } from '../src/utils/preset-world';

let n = 0;
const makeId = () => `id${++n}`;
const realGeo = () => ({
  regionFeatures: getRegionFeatures(),
  customMap: null,
  countries: getCountryInfo(),
  capitals: getCapitals(),
});

describe('каталог государств', () => {
  it('Холодная война: СССР вместо республик, рекомендуемые первыми, остальные — по имени', () => {
    const preset = loadPreset('cold_war_1951')!;
    const catalog = buildPolityCatalog(preset, presetMapCodes(realGeo()), getCountryInfo());
    const codes = catalog.map(p => p.code);

    expect(catalog[0]).toMatchObject({ code: 'USA', name: 'США', recommended: true, color: '#8FB3D9' });
    expect(catalog.find(p => p.code === 'RUS')).toMatchObject({ name: 'СССР', recommended: true });
    expect(catalog.find(p => p.code === 'RUS')!.members).toContain('KAZ');
    for (const member of ['UKR', 'KAZ', 'SRB', 'HRV', 'SVK']) expect(codes).not.toContain(member);
    // Играть можно и за страну вне пресета
    expect(catalog.find(p => p.code === 'MNG')).toMatchObject({ name: 'Монголия', recommended: false });

    const rest = catalog.filter(p => !p.recommended).map(p => p.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'ru')));
    expect(catalog.filter(p => p.recommended).map(p => p.code)).toEqual(preset.recommended);
  });

  it('описание государства из пресета доходит до каталога', () => {
    const preset = { ...validatePresetJson({
      id: 'desc_test', name: 'X', base_prompt: 'p',
      polities: { FRA: { name: 'Четвёртая республика', description: 'Колониальная империя в кризисе' } },
    }), has_custom_map: false, flags: [] };
    const fra = buildPolityCatalog(preset, ['FRA', 'BEL'], getCountryInfo()).find(p => p.code === 'FRA')!;
    expect(fra).toMatchObject({ name: 'Четвёртая республика', description: 'Колониальная империя в кризисе', recommended: true });
  });
});

describe('мир из пресета', () => {
  it('Холодная война на регионах: составные государства, столицы, цвета', () => {
    const preset = loadPreset('cold_war_1951')!;
    const t0 = Date.now();
    const built = buildPresetWorld(preset, 'cw', realGeo(), makeId);
    expect(Date.now() - t0).toBeLessThan(5000);

    const byId = new Map(built.regions.map(r => [r.id, r]));
    const ownerOfIso = (iso3: string) => built.regions.find(r => JSON.parse(r.geojson).properties.iso3 === iso3)!.owner;
    expect(ownerOfIso('UKR')).toBe('RUS');
    expect(ownerOfIso('KAZ')).toBe('RUS');
    expect(ownerOfIso('HRV')).toBe('YUG');
    expect(ownerOfIso('SVK')).toBe('CZE');
    expect(ownerOfIso('MNG')).toBe('MNG');

    // Игрок за СССР стартует в Москве, за Югославию — в регионе со столицей Сербии
    const moscow = byId.get(built.homeRegion.RUS)!;
    expect(moscow.objects.some((o: any) => o.type === 'capital' && o.name === 'Moscow')).toBe(true);
    const yugHome = byId.get(built.homeRegion.YUG)!;
    expect(JSON.parse(yugHome.geojson).properties.iso3).toBe('SRB');
    expect(yugHome.objects.some((o: any) => o.type === 'capital')).toBe(true);

    // Регион окрашен в цвет владельца; реестр — без стран-членов
    expect(byId.get(built.homeRegion.RUS)!.color).toBe('#A83A32');
    const polityIds = built.polities.map(p => p.id);
    expect(polityIds).toContain('RUS');
    expect(polityIds).not.toContain('UKR');
    expect(built.polities.find(p => p.id === 'RUS')!.name).toBe('СССР');

    // Названия регионов — на языке пресета
    expect(moscow.name).toMatch(/[А-Яа-я]/);
    expect(built.world).toMatchObject({ startDate: '1951-01-01', simulationRules: expect.any(String) });
  });

  it('своя карта пресета: одна фича = один регион, соседи по геометрии', () => {
    const preset = { ...validatePresetJson({
      id: 'custom_map', name: 'X', base_prompt: 'p',
      polities: { AAA: { name: 'Аркадия', color: '#112233', members: ['BBB'] } },
    }), has_custom_map: true, flags: [] };
    const sq = (x: number) => ({ type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] });
    const customMap = { features: [
      { type: 'Feature', properties: { code: 'AAA', name: 'Север' }, geometry: sq(0) },
      { type: 'Feature', properties: { code: 'BBB', name: 'Юг' }, geometry: sq(1) },
      { type: 'Feature', properties: { code: 'CCC', name: 'Восток' }, geometry: sq(5) },
    ] };
    const built = buildPresetWorld(preset, 'cm', { regionFeatures: null, customMap, countries: {}, capitals: {} }, makeId);

    expect(built.regions.map(r => [r.id, r.owner])).toEqual([['cm_AAA', 'AAA'], ['cm_BBB', 'AAA'], ['cm_CCC', 'CCC']]);
    expect(built.regions[0].borders).toEqual(['cm_BBB']);
    expect(built.regions[1].color).toBe('#112233');
    expect(built.homeRegion).toEqual({ AAA: 'cm_AAA', CCC: 'cm_CCC' });
    expect(built.polities.map(p => p.id).sort()).toEqual(['AAA', 'CCC']);
  });
});
