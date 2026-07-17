/**
 * Тесты json-repair (Этап 2): LLM часто возвращает «почти JSON» —
 * fences, болталку вокруг, висячие запятые, обрезанные по maxTokens ответы.
 */
import { describe, it, expect } from 'vitest';
import { parseJsonLoose } from '../src/utils/json-repair';

describe('parseJsonLoose', () => {
  it('валидный JSON проходит как есть', () => {
    expect(parseJsonLoose('{"a": 1, "b": [2, 3]}')).toEqual({ a: 1, b: [2, 3] });
  });

  it('снимает markdown-ограждения ```json', () => {
    const text = '```json\n{\n  "headline": "Война",\n  "date": "1951-01-01"\n}\n```';
    expect(parseJsonLoose(text)).toEqual({ headline: 'Война', date: '1951-01-01' });
  });

  it('извлекает объект из болталки вокруг', () => {
    const text = 'Вот ответ на ваш запрос:\n{"events": [], "narration": "тест"}\nНадеюсь, помогло!';
    expect(parseJsonLoose(text)).toEqual({ events: [], narration: 'тест' });
  });

  it('убирает висячие запятые', () => {
    const text = '{"events": [{"headline": "А",},], "narration": "х",}';
    expect(parseJsonLoose(text)).toEqual({ events: [{ headline: 'А' }], narration: 'х' });
  });

  it('добивает обрезанный по maxTokens JSON (незакрытые скобки и строка)', () => {
    const text = '{"events": [{"headline": "А", "description": "начало описания';
    const parsed = parseJsonLoose<any>(text);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].headline).toBe('А');
  });

  it('работает с массивом верхнего уровня', () => {
    expect(parseJsonLoose('[{"a": 1}, {"a": 2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('запятая внутри строки не считается висячей', () => {
    const text = '{"text": "один, } два", "n": 1}';
    expect(parseJsonLoose(text)).toEqual({ text: 'один, } два', n: 1 });
  });

  it('фигурные скобки внутри строк не ломают баланс', () => {
    const text = 'префикс {"a": "{не скобка}", "b": 2} суффикс';
    expect(parseJsonLoose(text)).toEqual({ a: '{не скобка}', b: 2 });
  });

  it('экранированные кавычки внутри строк', () => {
    const text = '{"q": "он сказал \\"привет\\" и ушёл"}';
    expect(parseJsonLoose(text)).toEqual({ q: 'он сказал "привет" и ушёл' });
  });

  it('чистый мусор — понятная ошибка', () => {
    expect(() => parseJsonLoose('никакого JSON тут нет')).toThrow(/JSON object not found/);
  });

  it('перекрёстные скобки — ошибка, а не тихий мусор', () => {
    expect(() => parseJsonLoose('{a: [}]')).toThrow();
  });
});
