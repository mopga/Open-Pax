/**
 * Open-Pax — минимальный markdown для ответов модели
 * =================================================
 * Модели отвечают с **жирным**, *курсивом* и заголовками `### …`. Рендерим
 * это React-узлами (без innerHTML — текст модели не исполняется как разметка).
 * Переносы строк сохраняет CSS (white-space: pre-wrap) у контейнера.
 */

import React from 'react';

export type InlineSegment = { text: string; bold?: boolean; italic?: boolean };

/** Разбор одной строки на сегменты: **жирный**, *курсив* или _курсив_ */
export function parseInline(line: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  const re = /\*\*(.+?)\*\*|\*(?!\s)([^*]+?)\*|_(?!\s)([^_]+?)_/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2] ?? m[3], italic: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** Текст модели → React-узлы: заголовки `#…` жирным, маркеры списков `* ` → `• ` */
export function renderMarkdown(text: string): React.ReactNode {
  return text.split('\n').map((raw, i, lines) => {
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(raw);
    const line = heading ? heading[1] : raw.replace(/^(\s*)[*-]\s+/, '$1• ');
    const segments = heading ? [{ text: line.replace(/\*\*/g, ''), bold: true }] : parseInline(line);
    return (
      <React.Fragment key={i}>
        {segments.map((s, j) => s.bold
          ? <strong key={j}>{s.text}</strong>
          : s.italic ? <em key={j}>{s.text}</em> : <React.Fragment key={j}>{s.text}</React.Fragment>)}
        {i < lines.length - 1 && '\n'}
      </React.Fragment>
    );
  });
}
