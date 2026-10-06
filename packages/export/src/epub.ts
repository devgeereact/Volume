// EPUB 3 export (docs/06-EXPORT-SPEC.md, EPUB 3): mimetype first and stored, container, OPF, nav with contents and
// landmarks, one XHTML file per section, one reflowable CSS file, optional cover image and embedded fonts.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  DEFAULT_INTERIOR_THEME,
  enabledSections,
  escapeHtml,
  inlineToHtml,
  sectionHeading,
  stripInline,
  type Block,
  type BookDoc,
  type InteriorTheme,
  type Section,
} from '@volume/core';
import { loadFontLibrary, type FontLibrary } from './fonts.ts';

export interface EpubOptions {
  /** eBook cover JPEG (1600 x 2560). Adds the cover-image item and a cover page. */
  coverJpeg?: Buffer;
  /** Embed the theme's body and heading fonts. Default false (spec: not embedded by default). */
  embedFonts?: boolean;
  images?: Record<string, Buffer>;
  /** dcterms:modified. Default now. Pass a fixed date for reproducible files. */
  modified?: Date;
  fonts?: FontLibrary;
}

const FENCED = new Set(['titlepage', 'copyright', 'contents', 'halftitle']);

/** Deterministic urn:uuid (name-based, SHA-1, RFC 4122 version 5 layout) from a stable id. */
export function uuidFromId(id: string): string {
  const h = createHash('sha1').update(`volume:${id}`).digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const xhtml = (lang: string, title: string, bodyClass: string, body: string, epubType = '') =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="../styles.css"/>
</head>
<body class="${bodyClass}"${epubType ? ` epub:type="${epubType}"` : ''}>
${body}
</body>
</html>
`;

function epubTypeFor(s: Section): string {
  const map: Record<string, string> = {
    dedication: 'dedication',
    epigraph: 'epigraph',
    foreword: 'foreword',
    preface: 'preface',
    acknowledgements: 'acknowledgments',
    introduction: 'introduction',
    conclusion: 'conclusion',
    epilogue: 'epilogue',
    appendix: 'appendix',
    glossary: 'glossary',
    references: 'bibliography',
    chapter: 'chapter',
    part: 'part',
    copyright: 'copyright-page',
    titlepage: 'titlepage',
    halftitle: 'halftitlepage',
  };
  return map[s.subtype] ?? (s.kind === 'back' ? 'backmatter' : s.kind === 'front' ? 'frontmatter' : 'bodymatter');
}

export async function exportEpub(book: BookDoc, theme: InteriorTheme = DEFAULT_INTERIOR_THEME, opts: EpubOptions = {}): Promise<Buffer> {
  const lang = book.meta.language || 'en-GB';
  const secs = enabledSections(book);
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>\n`,
  );

  const manifest: string[] = [];
  const spine: string[] = [];
  const imageFiles = new Map<string, string>();
  let imgN = 0;
  const imageHref = (src: string): string | undefined => {
    const known = imageFiles.get(src);
    if (known) return known;
    let buf: Buffer | undefined;
    if (src.startsWith('data:')) buf = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
    else buf = opts.images?.[src];
    if (!buf) return undefined;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const name = `images/img-${++imgN}.${isPng ? 'png' : 'jpg'}`;
    zip.file(`OEBPS/${name}`, buf);
    manifest.push(`<item id="img-${imgN}" href="${name}" media-type="${isPng ? 'image/png' : 'image/jpeg'}"/>`);
    imageFiles.set(src, name);
    return name;
  };

  const blockXhtml = (s: Section, b: Block, k: number, afterBreak: boolean): string => {
    switch (b.type) {
      case 'paragraph':
        return `<p${afterBreak || b.text.startsWith('**') ? ' class="noindent"' : ''}>${inlineToHtml(b.text)}</p>`;
      case 'heading2':
        return `<h2 id="${s.id}-s${k}">${inlineToHtml(b.text)}</h2>`;
      case 'heading3': {
        const tag = b.level === 4 ? 'h4' : 'h3';
        return `<${tag}>${inlineToHtml(b.text)}</${tag}>`;
      }
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        return `<${tag}>${b.items.map((it) => `<li>${inlineToHtml(it)}</li>`).join('')}</${tag}>`;
      }
      case 'table': {
        const [head, ...rows] = b.rows;
        if (!head) return '';
        return `<table><thead><tr>${head.map((c) => `<th>${inlineToHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineToHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
      case 'sceneBreak':
        return `<hr class="break"/>`;
      case 'quote':
        return `<blockquote class="${b.variant}"${b.variant === 'epigraph' ? ' epub:type="epigraph"' : ''}>${b.lines.map((l) => `<p>${inlineToHtml(l)}</p>`).join('')}${b.attribution ? `<p class="attr">${escapeHtml(b.attribution)}</p>` : ''}</blockquote>`;
      case 'takeaways':
        return `<aside class="takeaways"><p class="th">Key Takeaways</p><ul>${b.items.map((it) => `<li>${inlineToHtml(it)}</li>`).join('')}</ul></aside>`;
      case 'callout':
        return b.text ? `<p class="callout">${inlineToHtml(b.text)}</p>` : '';
      case 'image': {
        const href = imageHref(b.src);
        return href
          ? `<figure><img src="../${href}" alt="${escapeHtml(b.alt)}"/>${b.caption ? `<figcaption>${inlineToHtml(b.caption)}</figcaption>` : ''}</figure>`
          : '';
      }
      case 'pageBreak':
        return '';
    }
  };

  const linked = secs.filter((s) => !FENCED.has(s.subtype));
  const fileOf = (s: Section) => `text/${s.id}.xhtml`;
  let tocFile: string | undefined;

  if (opts.coverJpeg) {
    // The cover item is declared image/jpeg, so anything else would make an invalid EPUB.
    if (!(opts.coverJpeg[0] === 0xff && opts.coverJpeg[1] === 0xd8 && opts.coverJpeg[2] === 0xff))
      throw new Error('The EPUB cover must be a JPEG (the eBook cover from the cover studio).');
    zip.file('OEBPS/images/cover.jpg', opts.coverJpeg);
    manifest.push('<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>');
    zip.file(
      'OEBPS/text/cover.xhtml',
      xhtml(lang, 'Cover', 'cover', `<section epub:type="cover"><img class="cover" src="../images/cover.jpg" alt="${escapeHtml(book.meta.title)}"/></section>`),
    );
    manifest.push('<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover"/>');
  }

  secs.forEach((s, idx) => {
    let body: string;
    const title = sectionHeading(s);
    if (s.subtype === 'titlepage') {
      const [t = book.meta.title, sub = '', author = book.meta.author, ed = '', ...rest] = s.lines ?? [];
      body = `<section epub:type="titlepage" class="titlepage"><h1 class="t">${escapeHtml(t)}</h1>${sub ? `<p class="s">${escapeHtml(sub)}</p>` : ''}<p class="a">${escapeHtml(author)}</p>${ed ? `<p class="ed">${escapeHtml(ed)}</p>` : ''}${rest.map((x) => `<p class="lbl">${escapeHtml(x)}</p>`).join('')}</section>`;
    } else if (s.subtype === 'halftitle') {
      body = `<section epub:type="halftitlepage" class="halftitle"><p class="t">${escapeHtml(s.title)}</p></section>`;
    } else if (s.subtype === 'copyright') {
      body = `<section epub:type="copyright-page" class="copyright">${s.blocks.map((b) => (b.type === 'paragraph' ? `<p>${inlineToHtml(b.text)}</p>` : '')).join('')}</section>`;
    } else if (s.subtype === 'contents') {
      tocFile = fileOf(s);
      const items = secs
        .slice(idx + 1)
        .filter((x) => !FENCED.has(x.subtype))
        .map((x) => `<li><a href="${x.id}.xhtml">${escapeHtml(sectionHeading(x))}</a></li>`);
      body = `<section epub:type="toc" class="contents"><h1>Contents</h1><ol class="toc">${items.join('')}</ol></section>`;
    } else {
      const kicker = s.kicker ? `<p class="kicker">${escapeHtml(s.kicker)}</p>` : '';
      let afterBreak = true;
      const blocks = s.blocks.map((b, k) => {
        const out = blockXhtml(s, b, k, afterBreak);
        afterBreak = b.type !== 'paragraph';
        return out;
      });
      body = `<section epub:type="${epubTypeFor(s)}" class="${s.kind}" id="${s.id}"><header>${kicker}<h1>${escapeHtml(s.title)}</h1></header>${blocks.join('\n')}</section>`;
    }
    zip.file(`OEBPS/${fileOf(s)}`, xhtml(lang, title, s.kind, body));
    manifest.push(`<item id="x-${s.id}" href="${fileOf(s)}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="x-${s.id}"/>`);
  });

  // nav: chapters with subheadings, plus landmarks
  const navItems = linked
    .map((s) => {
      const subs =
        s.kind === 'chapter'
          ? s.blocks
              .map((b, k) => (b.type === 'heading2' ? `<li><a href="${fileOf(s)}#${s.id}-s${k}">${escapeHtml(stripInline(b.text))}</a></li>` : ''))
              .filter(Boolean)
          : [];
      return `<li><a href="${fileOf(s)}">${escapeHtml(sectionHeading(s))}</a>${subs.length ? `<ol>${subs.join('')}</ol>` : ''}</li>`;
    })
    .join('\n');
  const bodyStart = linked.find((s) => s.kind === 'chapter' || s.kind === 'part') ?? linked[0];
  const landmarks = [
    opts.coverJpeg ? '<li><a epub:type="cover" href="text/cover.xhtml">Cover</a></li>' : '',
    tocFile ? `<li><a epub:type="toc" href="${tocFile}">Contents</a></li>` : '<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>',
    bodyStart ? `<li><a epub:type="bodymatter" href="${fileOf(bodyStart)}">Start of content</a></li>` : '',
  ].join('');
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head><meta charset="UTF-8"/><title>Contents</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1>
<ol>
${navItems}
</ol>
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden"><h2>Landmarks</h2><ol>${landmarks}</ol></nav>
</body>
</html>
`,
  );
  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');

  // CSS (reflowable: relative sizes only) and optional fonts
  const lib = opts.fonts ?? loadFontLibrary();
  let fontCss = '';
  if (opts.embedFonts) {
    let n = 0;
    for (const fam of [...new Set([theme.fonts.body, theme.fonts.heading])]) {
      for (const f of lib.family(fam).filter((x) => !x.variable && (x.format === 'truetype' || x.format === 'opentype'))) {
        const name = `fonts/f${++n}.${f.format === 'truetype' ? 'ttf' : 'otf'}`;
        zip.file(`OEBPS/${name}`, readFileSync(f.path));
        manifest.push(`<item id="font-${n}" href="${name}" media-type="${f.format === 'truetype' ? 'font/ttf' : 'font/otf'}"/>`);
        fontCss += `@font-face { font-family: "${fam}"; font-weight: ${String(f.weight)}; font-style: ${f.style}; src: url("${name}"); }\n`;
      }
    }
  }
  const css = `${fontCss}body { font-family: "${theme.fonts.body}", serif; line-height: 1.45; margin: 0 4%; }
h1 { font-family: "${theme.fonts.heading}", sans-serif; font-size: 1.6em; line-height: 1.2; margin: 1.5em 0 1em; text-align: left; }
h2 { font-family: "${theme.fonts.heading}", sans-serif; font-size: 1.15em; margin: 1.4em 0 0.4em; text-align: left; }
h3 { font-family: "${theme.fonts.heading}", sans-serif; font-size: 1em; margin: 1.2em 0 0.3em; text-align: left; }
h4 { font-family: "${theme.fonts.heading}", sans-serif; font-size: 0.95em; font-style: italic; margin: 1em 0 0.25em; text-align: left; }
p { margin: 0; text-indent: 1.3em; text-align: justify; }
p.noindent { text-indent: 0; }
.kicker { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8em; margin: 2em 0 0; text-indent: 0; }
.kicker + h1 { margin-top: 0.3em; }
ul, ol { margin: 0.5em 0 0.8em; padding-left: 1.4em; }
li { margin-bottom: 0.25em; }
hr.break { border: 0; text-align: center; margin: 1em 0; }
hr.break::after { content: "* * *"; letter-spacing: 0.5em; }
table { border-collapse: collapse; width: 100%; font-size: 0.85em; margin: 0.8em 0; }
th, td { border-bottom: 1px solid #999; padding: 0.2em 0.3em; text-align: left; vertical-align: top; }
.callout { border: 1px solid #333; padding: 0.4em 0.6em; margin: 0.8em 0; text-indent: 0; font-size: 0.9em; }
.takeaways { border-top: 2px solid #333; border-bottom: 1px solid #333; margin: 1em 0; padding: 0.3em 0; }
.takeaways .th { font-weight: bold; text-indent: 0; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.85em; }
blockquote { margin: 1em 1.5em; font-style: italic; }
blockquote p { text-indent: 0; }
blockquote .attr { font-style: normal; }
.titlepage, .halftitle { text-align: center; margin-top: 20%; }
.titlepage .t { font-size: 2em; text-align: center; }
.titlepage p, .halftitle p { text-indent: 0; text-align: center; margin: 0.6em 0; }
.copyright p { text-indent: 0; font-size: 0.85em; margin: 0 0 0.6em; text-align: left; }
.toc { list-style: none; padding-left: 0; }
.cover { margin: 0; padding: 0; text-align: center; }
img.cover { max-width: 100%; height: auto; }
figure { margin: 1em 0; text-align: center; }
figure img { max-width: 100%; }
`;
  zip.file('OEBPS/styles.css', css);
  manifest.push('<item id="css" href="styles.css" media-type="text/css"/>');

  const modified = (opts.modified ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ident = book.meta.isbnEbook
    ? `urn:isbn:${book.meta.isbnEbook.replace(/[\s-]/g, '')}`
    : `urn:uuid:${uuidFromId(book.meta.identifier ?? `${book.meta.title}|${book.meta.author}`)}`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeHtml(ident)}</dc:identifier>
    <dc:title id="title">${escapeHtml(book.meta.title)}</dc:title>
${book.meta.subtitle ? `    <dc:title id="subtitle">${escapeHtml(book.meta.subtitle)}</dc:title>\n    <meta refines="#title" property="title-type">main</meta>\n    <meta refines="#subtitle" property="title-type">subtitle</meta>\n` : ''}    <dc:creator id="author">${escapeHtml(book.meta.author)}</dc:creator>
    <meta refines="#author" property="role" scheme="marc:relators">aut</meta>
    <dc:language>${escapeHtml(lang)}</dc:language>
${book.meta.imprint ? `    <dc:publisher>${escapeHtml(book.meta.imprint)}</dc:publisher>\n` : ''}${book.meta.year ? `    <dc:date>${book.meta.year}</dc:date>\n` : ''}    <meta property="dcterms:modified">${modified}</meta>
${opts.coverJpeg ? '    <meta name="cover" content="cover-image"/>\n' : ''}  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine>
    ${spine.join('\n    ')}
  </spine>
</package>
`;
  zip.file('OEBPS/content.opf', opf);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, mimeType: 'application/epub+zip' });
}
