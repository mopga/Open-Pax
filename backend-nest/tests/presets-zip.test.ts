/**
 * Тесты этапа 5: импорт/экспорт пресет-пакетов zip.
 *
 * Временная БД не нужна (роуты/утилиты работают только с файлами),
 * но PRESETS_DIR — константа data/presets в cwd, поэтому тестовые
 * пресеты создаются в реальном data/presets с уникальным id
 * (test-zip-<pid>) и удаляются после прогона.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { buildPresetZip, importPresetZip, PresetZipError } from '../src/utils/preset-zip';
import { loadPreset, PRESETS_DIR, LEGACY_TEMPLATES_DIR } from '../src/utils/preset-loader';

const PID = process.pid;
const PKG_ID = `test-zip-${PID}`;       // пакет на диске (сценарий экспорта)
const IMPORT_ID = `test-zip-in-${PID}`; // пакет, создаваемый импортом
const IMPORT2_ID = `test-zip-ow-${PID}`; // пакет для сценария overwrite
const LEGACY_ID = `testziplegacy${PID}`; // синтетический легаси-шаблон (PRESET_ID_RE требует [a-z0-9_-])
const EVIL = `evil-${PID}.txt`;          // файл zip-slip — не должен появиться

const pkgDir = path.join(PRESETS_DIR, PKG_ID);
const importDir = path.join(PRESETS_DIR, IMPORT_ID);
const import2Dir = path.join(PRESETS_DIR, IMPORT2_ID);
const legacyFile = path.join(LEGACY_TEMPLATES_DIR, `${LEGACY_ID}.json`);

function cleanup() {
  for (const d of [pkgDir, importDir, import2Dir]) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  fs.rmSync(legacyFile, { force: true });
  // На всякий случай подчищаем возможные «вылетевшие» zip-slip файлы
  for (const p of [
    path.join(PRESETS_DIR, '..', EVIL),       // data/<evil>
    path.join(PRESETS_DIR, '..', '..', EVIL), // backend-nest/<evil>
  ]) {
    fs.rmSync(p, { force: true });
  }
}
afterAll(cleanup);

/** Минимально валидный preset.json */
function makePresetJson(id: string) {
  return {
    id,
    name: 'Тестовый пресет',
    description: 'Описание тестового пресета',
    start_date: '1960-01-01',
    country_codes: ['USA', 'RUS'],
    base_prompt: 'Тестовый базовый промпт',
  };
}

function zipOf(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
  }
  return zip.toBuffer();
}

describe('preset-zip: экспорт', () => {
  it('экспорт легаси-шаблона → синтезированный zip с одним preset.json', () => {
    // Синтетический легаси-шаблон (cold_war_1951 теперь полноценный пакет
    // с rules.md + lore.md, поэтому legacy-ветку проверяем на своём файле)
    fs.writeFileSync(legacyFile, JSON.stringify({
      id: LEGACY_ID,
      name: 'Тестовый легаси',
      description: 'd',
      start_date: '1970-01-01',
      country_codes: "['USA', 'RUS']", // легаси-строковый формат
      base_prompt: 'Легаси промпт',
    }));

    const buf = buildPresetZip(LEGACY_ID);
    expect(buf).toBeTruthy();

    const zip = new AdmZip(buf!);
    const names = zip.getEntries().map(e => e.entryName);
    expect(names).toEqual(['preset.json']);

    const raw = JSON.parse(zip.getEntry('preset.json')!.getData().toString('utf-8'));
    expect(raw.id).toBe(LEGACY_ID);
    expect(raw.name).toBeTruthy();
    expect(Array.isArray(raw.country_codes)).toBe(true);
    expect(raw.country_codes).toContain('USA');
    expect(raw.base_prompt).toBeTruthy();
    expect(raw.start_date).toBe('1970-01-01');
  });

  it('экспорт штатного пакета cold_war_1951 → preset.json + rules.md + lore.md', () => {
    const buf = buildPresetZip('cold_war_1951');
    expect(buf).toBeTruthy();

    const zip = new AdmZip(buf!);
    const names = zip.getEntries().map(e => e.entryName).sort();
    expect(names).toEqual(['lore.md', 'preset.json', 'rules.md']);

    const raw = JSON.parse(zip.getEntry('preset.json')!.getData().toString('utf-8'));
    expect(raw.id).toBe('cold_war_1951');
    expect(raw.country_codes).toContain('USA');
    expect(raw.country_codes).toContain('RUS');
    expect(raw.start_date).toBe('1951-01-01');
    expect(zip.getEntry('rules.md')!.getData().toString('utf-8').length).toBeGreaterThan(0);
  });

  it('экспорт пакета с rules.md → в zip есть rules.md и флаги', () => {
    fs.mkdirSync(path.join(pkgDir, 'flags'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'preset.json'), JSON.stringify(makePresetJson(PKG_ID), null, 2));
    fs.writeFileSync(path.join(pkgDir, 'rules.md'), 'ПРАВИЛА-ТЕСТ');
    fs.writeFileSync(path.join(pkgDir, 'flags', 'USA.svg'), '<svg/>');

    const buf = buildPresetZip(PKG_ID);
    expect(buf).toBeTruthy();

    const zip = new AdmZip(buf!);
    const names = zip.getEntries().map(e => e.entryName).sort();
    expect(names).toContain('preset.json');
    expect(names).toContain('rules.md');
    expect(names).toContain('flags/USA.svg');
    expect(zip.getEntry('rules.md')!.getData().toString('utf-8')).toBe('ПРАВИЛА-ТЕСТ');
  });

  it('экспорт несуществующего пресета → null', () => {
    expect(buildPresetZip(`no-such-${PID}`)).toBeNull();
  });
});

describe('preset-zip: импорт', () => {
  it('импорт собранного zip → data/presets/<id> создан, loadPreset его видит', () => {
    const buf = zipOf({
      'preset.json': JSON.stringify(makePresetJson(IMPORT_ID)),
      'rules.md': 'ПРАВИЛА-ИМПОРТ',
      'junk.exe': 'xxx', // посторонняя запись — должна быть проигнорирована
    });

    const { preset } = importPresetZip(buf);
    expect(preset.id).toBe(IMPORT_ID);
    expect(preset.source).toBe('preset');

    expect(fs.existsSync(path.join(importDir, 'preset.json'))).toBe(true);
    expect(fs.existsSync(path.join(importDir, 'rules.md'))).toBe(true);
    expect(fs.existsSync(path.join(importDir, 'junk.exe'))).toBe(false);

    const loaded = loadPreset(IMPORT_ID);
    expect(loaded).toBeTruthy();
    expect(loaded!.source).toBe('preset');
    expect(loaded!.simulation_rules).toBe('ПРАВИЛА-ИМПОРТ');
    expect(loaded!.country_codes).toEqual(['USA', 'RUS']);
  });

  it('повторный импорт без overwrite → EXISTS, с overwrite → ок', () => {
    importPresetZip(zipOf({
      'preset.json': JSON.stringify(makePresetJson(IMPORT2_ID)),
      'rules.md': 'V1',
    }));

    let code: string | undefined;
    try {
      importPresetZip(zipOf({ 'preset.json': JSON.stringify(makePresetJson(IMPORT2_ID)) }));
    } catch (e: any) {
      code = e.code;
    }
    expect(code).toBe('EXISTS');

    const { preset } = importPresetZip(
      zipOf({
        'preset.json': JSON.stringify(makePresetJson(IMPORT2_ID)),
        'rules.md': 'V2',
      }),
      { overwrite: true },
    );
    expect(preset.simulation_rules).toBe('V2');
    expect(loadPreset(IMPORT2_ID)?.simulation_rules).toBe('V2');
  });

  it('не-zip буфер → INVALID_ZIP', () => {
    let code: string | undefined;
    try {
      importPresetZip(Buffer.from('это вообще не zip-архив'));
    } catch (e: any) {
      code = e.code;
    }
    expect(code).toBe('INVALID_ZIP');
  });

  it('zip без preset.json → INVALID_ZIP', () => {
    const buf = zipOf({ 'readme.txt': 'nope' });
    expect(() => importPresetZip(buf)).toThrowError(PresetZipError);
    let code: string | undefined;
    try {
      importPresetZip(buf);
    } catch (e: any) {
      code = e.code;
    }
    expect(code).toBe('INVALID_ZIP');
  });

  it('невалидный preset.json → INVALID_PRESET', () => {
    const buf = zipOf({ 'preset.json': JSON.stringify({ id: 'bad id!' }) });
    let code: string | undefined;
    try {
      importPresetZip(buf);
    } catch (e: any) {
      code = e.code;
    }
    expect(code).toBe('INVALID_PRESET');
  });

  it('zip-slip запись "../../evil" игнорируется, файла вне каталога нет', () => {
    const buf = zipOf({
      'preset.json': JSON.stringify(makePresetJson(IMPORT2_ID)),
      [`../../${EVIL}`]: 'pwned',
    });

    importPresetZip(buf, { overwrite: true });

    // Файл не должен появиться ни в data/, ни в корне backend-nest
    expect(fs.existsSync(path.join(PRESETS_DIR, '..', EVIL))).toBe(false);
    expect(fs.existsSync(path.join(PRESETS_DIR, '..', '..', EVIL))).toBe(false);
    // А сам пресет импортирован штатно
    expect(loadPreset(IMPORT2_ID)).toBeTruthy();
  });
});
