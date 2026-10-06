// Markdown export: the canonical manuscript in the dialect (the file Volume imports back).
import { serialiseManuscript, type BookDoc } from '@volume/core';

export function exportMarkdown(book: BookDoc): Buffer {
  return Buffer.from(serialiseManuscript(book), 'utf8');
}
