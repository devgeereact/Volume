import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportDocx } from '../src/index.ts';
import { golden, loadWindowsill } from './helpers.ts';

/** Normalise WordprocessingML for golden comparison: drop rsids and volatile ids, one tag per line. */
function normaliseXml(xml: string): string {
  return xml
    .replace(/\s+w:rsid\w*="[^"]*"/g, '')
    .replace(/\s+w14:paraId="[^"]*"|\s+w14:textId="[^"]*"/g, '')
    .replace(/></g, '>\n<');
}

describe('DOCX (Windowsill Herbs)', () => {
  let zip: JSZip;
  let doc = '';
  let styles = '';
  let settings = '';
  beforeAll(async () => {
    const { book } = loadWindowsill();
    zip = await JSZip.loadAsync(await exportDocx(book));
    doc = (await zip.file('word/document.xml')?.async('string')) ?? '';
    styles = (await zip.file('word/styles.xml')?.async('string')) ?? '';
    settings = (await zip.file('word/settings.xml')?.async('string')) ?? '';
  });

  it('uses named Heading 1 and Heading 2 styles', () => {
    expect((doc.match(/<w:pStyle w:val="Heading1"\/>/g) ?? []).length).toBe(9);
    expect((doc.match(/<w:pStyle w:val="Heading2"\/>/g) ?? []).length).toBe(46);
    expect(styles).toContain('<w:name w:val="Heading 1"/>');
    for (const name of [
      'First Paragraph',
      'Title Page Title',
      'Title Page Subtitle',
      'Title Page Author',
      'Copyright',
      'Contents Heading',
      'Part Title',
      'Epigraph',
      'Dedication',
      'List Bullet',
      'Takeaways Heading',
      'Takeaways Item',
      'Scene Break',
    ]) {
      expect(styles, name).toContain(`<w:name w:val="${name}"/>`);
    }
  });

  it('breaks the page before every Heading 1 through the style', () => {
    const h1 = /<w:style [^>]*w:styleId="Heading1".*?<\/w:style>/s.exec(styles)?.[0] ?? '';
    expect(h1).toContain('<w:pageBreakBefore/>');
  });

  it('sets the 6 x 9 in page, mirrored margins and a PAGE field footer', async () => {
    expect(doc).toContain('<w:pgSz w:w="8640" w:h="12960"');
    expect(doc).toMatch(/<w:pgMar w:top="1080" w:right="792" w:bottom="1152" w:left="1152"/);
    expect(settings).toContain('<w:mirrorMargins/>');
    const footers = Object.keys(zip.files).filter((f) => /word\/footer\d+\.xml/.test(f));
    const entries = footers.map((f) => zip.file(f)).filter((e) => e !== null);
    const xml = await Promise.all(entries.map((e) => e.async('string')));
    expect(xml.some((x) => x.includes('PAGE'))).toBe(true);
  });

  it('links each contents entry to a bookmark on its heading', () => {
    const anchors = [...doc.matchAll(/<w:hyperlink [^>]*w:anchor="([^"]+)"/g)].map((m) => m[1]);
    const marks = [...doc.matchAll(/<w:bookmarkStart [^>]*w:name="([^"]+)"/g)].map((m) => m[1]);
    expect(anchors).toHaveLength(9);
    expect(new Set(anchors)).toEqual(new Set(marks));
  });

  it('has no blank spacer paragraphs and embeds the fonts', () => {
    const paras = doc.match(/<w:p>.*?<\/w:p>|<w:p [^>]*>.*?<\/w:p>|<w:p\/>/gs) ?? [];
    const blank = paras.filter((p) => !/<w:t[ >]/.test(p) && !p.includes('<w:br') && !p.includes('<w:drawing'));
    expect(blank).toHaveLength(0);
    expect(Object.keys(zip.files).filter((f) => f.startsWith('word/fonts/') && f.endsWith('.odttf')).length).toBeGreaterThan(0);
  });

  it('matches the normalised golden document.xml and styles.xml', () => {
    expect(normaliseXml(doc)).toBe(golden('windowsill-herbs.document.xml', normaliseXml(doc)));
    expect(normaliseXml(styles)).toBe(golden('windowsill-herbs.styles.xml', normaliseXml(styles)));
  });
});
