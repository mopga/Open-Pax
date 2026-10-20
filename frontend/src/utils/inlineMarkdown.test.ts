import { describe, it, expect } from 'vitest';
import { parseInline } from './inlineMarkdown';

describe('parseInline', () => {
  it('жирный и курсив', () => {
    expect(parseInline('**Экономика:** ускорить *добычу* нефти')).toEqual([
      { text: 'Экономика:', bold: true },
      { text: ' ускорить ' },
      { text: 'добычу', italic: true },
      { text: ' нефти' },
    ]);
  });

  it('звёздочка без пары и умножение не ломают текст', () => {
    expect(parseInline('рост * 2 и 3 * 4')).toEqual([{ text: 'рост * 2 и 3 * 4' }]);
    expect(parseInline('просто текст')).toEqual([{ text: 'просто текст' }]);
  });
});
