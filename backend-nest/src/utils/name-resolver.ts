/**
 * Open-Pax — Name Resolver
 * =========================
 * "ИИ по именам, движок по id": LLM видит только имена регионов и политий,
 * а движок резолвит их обратно в идентификаторы.
 *
 * Конвенция идентификаторов (Этап 0):
 *   polityId  — id политии: код страны ('USA') для шаблонов,
 *               'player' / 'ai-N' для кастомных карт, 'neutral' — зарезервировано.
 *   regionId  — `${worldId}_${code}` для шаблонов; произвольный для кастомных карт.
 *   region.owner = polityId.
 */

export interface ResolvableRegion {
  id: string;
  name: string;
  owner: string;
  color?: string;
}

/**
 * Нормализация имени для сравнения: lowercase, без кавычек/скобок,
 * схлопывание пробелов. Покрывает типичные вольности LLM («США», "США", [USA]).
 *
 * NB: NFD-разложение + снятие диакритики НЕ используем — оно ломает
 * кириллическую «й» (разлагается в «и» + combining breve).
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // сначала содержимое скобок целиком
    .replace(/[«»"'„“”\[\](){}]/g, ' ')
    .replace(/[^a-zа-яё0-9]+/giu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Резолвер регионов по имени. Строится один раз на ход из текущих регионов.
 * Порядок матчинга: точное совпадение → префикс → вхождение.
 */
export class RegionResolver {
  private byNormalized: Map<string, ResolvableRegion> = new Map();
  private entries: { normalized: string; region: ResolvableRegion }[] = [];

  constructor(regions: ResolvableRegion[]) {
    for (const region of regions) {
      const normalized = normalizeName(region.name);
      if (!normalized) continue;
      if (!this.byNormalized.has(normalized)) {
        this.byNormalized.set(normalized, region);
      }
      this.entries.push({ normalized, region });
    }
  }

  resolve(name: string | undefined | null): ResolvableRegion | undefined {
    if (!name) return undefined;
    const needle = normalizeName(name);
    if (!needle) return undefined;

    // 1. Exact match
    const exact = this.byNormalized.get(needle);
    if (exact) return exact;

    // 2. Prefix match (either direction): "Германия" ~ "Западная Германия"
    const prefix = this.entries.filter(
      e => e.normalized.startsWith(needle) || needle.startsWith(e.normalized)
    );
    if (prefix.length > 0) {
      // Самое длинное совпадение — самое специфичное
      prefix.sort((a, b) => b.normalized.length - a.normalized.length);
      return prefix[0].region;
    }

    // 3. Substring match
    const sub = this.entries.filter(
      e => e.normalized.includes(needle) || needle.includes(e.normalized)
    );
    if (sub.length > 0) {
      sub.sort((a, b) => b.normalized.length - a.normalized.length);
      return sub[0].region;
    }

    return undefined;
  }
}

export interface PolityInfo {
  polityId: string;
  displayName: string;
  color?: string;
  isPlayer: boolean;
}

export interface PolityResolution {
  polityId: string;
  /** true, если полития новая (LLM создала её в этом ходе) */
  isNew: boolean;
}

/**
 * Резолвер политий по имени. Алиасы: отображаемое имя, сам polityId
 * (код страны), варианты обращения к игроку ('игрок', 'player', имя его политии).
 */
export class PolityResolver {
  private byNormalized: Map<string, PolityInfo> = new Map();
  private entries: { normalized: string; polity: PolityInfo }[] = [];

  constructor(regions: ResolvableRegion[], private playerPolityId?: string) {
    const polities = new Map<string, PolityInfo>();

    for (const region of regions) {
      const owner = region.owner || 'neutral';
      if (!polities.has(owner)) {
        polities.set(owner, {
          polityId: owner,
          displayName: region.name, // первая встреченная — «главный» регион
          color: region.color,
          isPlayer: owner === playerPolityId,
        });
      }
    }

    for (const polity of polities.values()) {
      this.addAlias(polity, polity.polityId);
      this.addAlias(polity, polity.displayName);
      if (polity.isPlayer) {
        this.addAlias(polity, 'player');
        this.addAlias(polity, 'игрок');
        this.addAlias(polity, 'игрока');
      }
    }
  }

  private addAlias(polity: PolityInfo, alias: string) {
    const normalized = normalizeName(alias);
    if (!normalized) return;
    if (!this.byNormalized.has(normalized)) {
      this.byNormalized.set(normalized, polity);
    }
    this.entries.push({ normalized, polity });
  }

  getPlayerPolityId(): string | undefined {
    return this.playerPolityId;
  }

  /** Список известных политий (для отладки/логов). */
  listPolities(): PolityInfo[] {
    const seen = new Map<string, PolityInfo>();
    for (const e of this.entries) seen.set(e.polity.polityId, e.polity);
    return Array.from(seen.values());
  }

  resolve(name: string | undefined | null): PolityResolution | undefined {
    if (!name) return undefined;
    const trimmed = name.trim();
    const needle = normalizeName(trimmed);
    if (!needle) return undefined;

    const exact = this.byNormalized.get(needle);
    if (exact) return { polityId: exact.polityId, isNew: false };

    const prefix = this.entries.filter(
      e => e.normalized.startsWith(needle) || needle.startsWith(e.normalized)
    );
    if (prefix.length > 0) {
      prefix.sort((a, b) => b.normalized.length - a.normalized.length);
      return { polityId: prefix[0].polity.polityId, isNew: false };
    }

    const sub = this.entries.filter(
      e => e.normalized.includes(needle) || needle.includes(e.normalized)
    );
    if (sub.length > 0) {
      sub.sort((a, b) => b.normalized.length - a.normalized.length);
      return { polityId: sub[0].polity.polityId, isNew: false };
    }

    // Неизвестная полития — LLM создала новую. Id = само имя (валидный ключ матрицы).
    return { polityId: trimmed, isNew: true };
  }

  /** Цвет существующей политии (для перекраски региона при передаче). */
  colorOf(polityId: string): string | undefined {
    for (const e of this.entries) {
      if (e.polity.polityId === polityId) return e.polity.color;
    }
    return undefined;
  }
}
