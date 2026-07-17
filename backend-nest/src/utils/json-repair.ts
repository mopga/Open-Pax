/**
 * Open-Pax — JSON Repair (jsonrepair-подход, без зависимостей)
 * ============================================================
 * LLM часто возвращает «почти JSON»: обёртку ```json, болтологию вокруг,
 * висячие запятые, незакрытые скобки, одинарные кавычки.
 * repairJson пытается выжать валидный объект из такого ответа.
 */

/** Снять markdown-ограждения ```json ... ``` */
function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, '');
    const end = t.lastIndexOf('```');
    if (end >= 0) t = t.slice(0, end);
  }
  return t.trim();
}

/** Извлечь сбалансированный фрагмент, начиная с первого '{' или '[' (с учётом строк). */
function extractBalanced(text: string): string | null {
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') { start = i; break; }
  }
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return null; // перекрёстные скобки — мусор
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }

  // Незакрытый JSON — вернём всё от первой скобки, добьём скобки ниже
  return text.slice(start);
}

/** Убрать висячие запятые перед } или ] */
function removeTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (!inString && ch === ',') {
      // Смотрим вперёд: следующий не-пробельный символ } или ] — запятую пропускаем
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

/** Добить незакрытые строки/скобки в конце обрезанного JSON. */
function closeUnfinished(text: string): string {
  let depthCurly = 0;
  let depthSquare = 0;
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { stack.push('}'); depthCurly++; }
    else if (ch === '[') { stack.push(']'); depthSquare++; }
    else if (ch === '}' || ch === ']') { stack.pop(); if (ch === '}') depthCurly--; else depthSquare--; }
  }

  let out = text;
  if (inString) out += '"';
  // Закрываем в обратном порядке
  while (stack.length > 0) out += stack.pop();
  return out;
}

/**
 * Распарсить ответ LLM как JSON-объект с ремонтом.
 * Бросает Error, только если объект извлечь не удалось совсем.
 */
export function parseJsonLoose<T = any>(text: string): T {
  const stripped = stripFences(text);

  // 1. Как есть
  try { return JSON.parse(stripped) as T; } catch { /* ремонтируем */ }

  // 2. Сбалансированный фрагмент
  const balanced = extractBalanced(stripped);
  if (!balanced) throw new Error('JSON object not found in LLM response');
  try { return JSON.parse(balanced) as T; } catch { /* дальше */ }

  // 3. Без висячих запятых
  const noTrailing = removeTrailingCommas(balanced);
  try { return JSON.parse(noTrailing) as T; } catch { /* дальше */ }

  // 4. Добиваем незакрытые скобки/строки (ответ обрезан по maxTokens)
  const closed = removeTrailingCommas(closeUnfinished(noTrailing));
  return JSON.parse(closed) as T;
}
