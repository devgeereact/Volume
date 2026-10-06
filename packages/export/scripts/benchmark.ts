// Synthetic long-book check. Does not read manuscripts, .env or the owner's database.
import { DEFAULT_INTERIOR_THEME, parseManuscript } from '@volume/core';
import { loadKdpRules } from '@volume/core/node';
import { exportPrintPdf, inspectPdf } from '../src/index.ts';

const paragraph = 'A reader can practise a small task each morning and record the result before choosing the next useful step. '.repeat(11);
const markdown =
  '::: titlepage\nLong Book Benchmark\nSynthetic text only\nTest Author\n:::\n\n::: contents\n:::\n\n' +
  Array.from({ length: 40 }, (_, i) => `# Chapter ${i + 1}: Test chapter\n\n` + Array.from({ length: 10 }, () => paragraph).join('\n\n')).join('\n\n');
const started = performance.now();
const result = await exportPrintPdf(parseManuscript(markdown), DEFAULT_INTERIOR_THEME, { rules: loadKdpRules(), trim: '5x8', timeoutMs: 180000 });
const inspection = await inspectPdf(result.buffer);
const fontsEmbedded = inspection.fonts.every((font) => font.embedded && !font.type3);
console.log(
  JSON.stringify(
    {
      words: markdown.split(/\s+/).length,
      pages: result.pageCount,
      seconds: (performance.now() - started) / 1000,
      pdfBytes: result.buffer.length,
      peakNodeRssMb: process.resourceUsage().maxRSS / 1024,
      fontsEmbedded,
      warnings: result.warnings,
    },
    null,
    2,
  ),
);
if (result.pageCount < 300 || !fontsEmbedded || result.warnings.length) process.exitCode = 1;
