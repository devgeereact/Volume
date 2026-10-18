// KDP upload pack zip (docs/book-production/EXPORT-SPEC.md, Upload pack).
import JSZip from 'jszip';
import { describeRules, slugify, type BookDoc, type KdpRules, type Paper, type TrimKey } from '@volume/core';
import type { ClaimItem, PreflightReport } from './preflight.ts';
import { preflightHtml, preflightText } from './preflight.ts';
import { htmlToParagraphs } from './txt.ts';

export interface PackFiles {
  interiorPdf?: Buffer;
  epub?: Buffer;
  docx?: Buffer;
  txt?: Buffer;
  md?: Buffer;
  ebookCover?: Buffer;
  wrapPdf?: Buffer;
}

export interface PackMetadata {
  edition?: string;
  series?: string;
  prices?: { marketplace: string; format: 'ebook' | 'paperback'; listPrice: number; currency: string }[];
}

export interface AiDisclosure {
  aiWroteText: boolean;
  aiMadeImages: boolean;
  /** Models used, for the owner's records. */
  textModels?: string[];
  imageModels?: string[];
}

export interface UploadPackInput {
  book: BookDoc;
  files: PackFiles;
  trim: TrimKey;
  paper: Paper;
  /** Interior page count (from the PDF) for the wrap file name. */
  pages?: number;
  rules: KdpRules;
  /** Rule ids the exports used (for kdp-rules-used.txt). */
  ruleIds?: string[];
  preflight?: PreflightReport;
  claims?: ClaimItem[];
  ai: AiDisclosure;
  metadata?: PackMetadata;
  marketing?: { tiktokScripts?: string; instagramCaptions?: string; launchEmail?: string };
  /** Back-cover blurb as plain text (D-049): the matter-stage blurb, else the blueprint blurb. Written to listing/back-cover-blurb.txt when non-empty. */
  backCoverBlurb?: string;
  /** Short author bio as plain text (D-049). Written to listing/short-bio.txt when non-empty. */
  shortBio?: string;
  /** A picture book (D-044): print PDF only, no EPUB or DOCX; the README and the disclosure note say so. */
  pictureBook?: boolean;
  date?: Date;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function claimsCsv(claims: ClaimItem[]): string {
  const rows = [['chapter', 'sentence', 'category', 'check needed', 'status'], ...claims.map((c) => [c.chapter, c.sentence, c.category, c.check, c.status])];
  return `${rows.map((r) => r.map(csvCell).join(',')).join('\n')}\n`;
}

export function metadataSheet(book: BookDoc, md: PackMetadata = {}): string {
  const m = book.meta;
  const l = m.listing ?? {};
  const lines = [
    `Title: ${m.title}`,
    `Subtitle: ${m.subtitle ?? ''}`,
    `Author: ${m.author}`,
    `Edition: ${md.edition ?? m.edition ?? ''}`,
    `Series: ${md.series ?? ''}`,
    `Language: ${m.language}`,
    `Imprint: ${m.imprint ?? ''}`,
    `ISBN (paperback): ${m.isbnPrint ?? 'none entered (KDP can assign a free one)'}`,
    `ISBN (eBook): ${m.isbnEbook ?? 'none entered (optional)'}`,
    '',
    'Prices:',
    ...(md.prices?.length ? md.prices.map((p) => `- ${p.format} on ${p.marketplace}: ${p.currency} ${p.listPrice.toFixed(2)}`) : ['- not set']),
    '',
    'Keywords:',
    ...(l.keywords ?? []).map((k, i) => `${i + 1}. ${k}`),
    '',
    "Categories (pick each one in KDP's own chooser):",
    ...(l.categories ?? []).map((c, i) => `${i + 1}. ${c}`),
    '',
    'Description (plain text; the HTML version is in description.html):',
    ...htmlToParagraphs(l.description ?? ''),
  ];
  return `${lines.join('\n')}\n`;
}

export function aiDisclosureNote(ai: AiDisclosure, rules: KdpRules, opts: { pictureBook?: boolean } = {}): string {
  const r = rules.rules.find((x) => x.id === 'ai.disclosure');
  const generated = ai.aiWroteText || ai.aiMadeImages;
  const lines = [
    'KDP AI content disclosure',
    '',
    `Text: ${ai.aiWroteText ? "AI-generated (Volume's AI wrote the text, even where it was edited afterwards)" : 'not AI-generated'}`,
    `Images: ${ai.aiMadeImages ? `AI-generated (${opts.pictureBook ? 'the spread pictures and the cover art came' : 'the cover art came'} from an image model)` : 'not AI-generated'}`,
    ...(ai.textModels?.length ? [`Text models: ${ai.textModels.join(', ')}`] : []),
    ...(ai.imageModels?.length ? [`Image models: ${ai.imageModels.join(', ')}`] : []),
    '',
    generated ? 'Answer "Yes" to the AI-generated content question in KDP and tick what applies.' : 'No AI-generated content to disclose.',
    '',
    `Rule: ai.disclosure (FACTS ${r?.factId ?? '5.5'}, ${r?.status ?? 'confirmed'}, verified ${r?.verifiedOn ?? ''}), ${r?.source ?? ''}`,
  ];
  return `${lines.join('\n')}\n`;
}

const PICTURE_BOOK_NOTE = `
Picture book: the interior PDF is full colour with bleed, so choose colour ink, white paper and "Bleed" in KDP's print
options. This pack has no EPUB or DOCX: a picture-book eBook needs a fixed layout, which is a later format (D-044).
`;

const README = (slug: string, marketing: string, pictureBook = false, listingExtras: string[] = []) => `KDP upload pack for ${slug}

manuscript/   the interior PDF (paperback), EPUB and DOCX (eBook), TXT and Markdown (your records)
cover/        the eBook cover JPEG and the paperback wrap PDF
listing/      metadata, the HTML description${listingExtras.map((x) => `, ${x}`).join('')} and the AI disclosure note
reports/      preflight, claims to verify and the KDP rules used
${marketing ? `marketing/    ${marketing}\n` : ''}
How KDP takes each format (FACTS 10.3): on the Bookshelf choose + Create, then Kindle eBook or Paperback. Each title
has three pages in this order: (1) details, which must match the manuscript; (2) content: upload the manuscript and
cover and preview (eBook: the EPUB or DOCX and the eBook cover JPEG; paperback: the interior PDF and the wrap PDF,
with print options and ISBN); (3) rights and pricing. You need a unique ISBN for each format if you use one.
Check reports/preflight.txt before you upload.
${pictureBook ? PICTURE_BOOK_NOTE : ''}`;

/** "a", "a and b", "a, b and c" (first letter capitalised). */
function listLabels(labels: string[]): string {
  if (!labels.length) return '';
  const last = labels[labels.length - 1] ?? '';
  const text = labels.length === 1 ? last : `${labels.slice(0, -1).join(', ')} and ${last}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Build `<slug>-kdp-pack-<YYYY-MM-DD>.zip`. Returns the file name and the zip bytes. */
export async function buildUploadPack(input: UploadPackInput): Promise<{ fileName: string; zip: Buffer }> {
  const slug = slugify(input.book.meta.title) || 'book';
  const date = (input.date ?? new Date()).toISOString().slice(0, 10);
  const z = new JSZip();
  const f = input.files;
  const mk = input.marketing ?? {};
  const marketing = [
    { path: 'marketing/tiktok-scripts.txt', label: 'TikTok scripts', text: mk.tiktokScripts },
    { path: 'marketing/instagram-captions.txt', label: 'Instagram captions', text: mk.instagramCaptions },
    { path: 'marketing/launch-email.txt', label: 'the launch email', text: mk.launchEmail },
  ].filter((m): m is { path: string; label: string; text: string } => typeof m.text === 'string' && m.text.trim() !== '');
  const listingText = [
    { path: 'listing/back-cover-blurb.txt', label: 'the back-cover blurb', text: input.backCoverBlurb },
    { path: 'listing/short-bio.txt', label: 'the short bio', text: input.shortBio },
  ].filter((m): m is { path: string; label: string; text: string } => typeof m.text === 'string' && m.text.trim() !== '');
  z.file(
    'README.txt',
    README(
      slug,
      listLabels(marketing.map((m) => m.label)),
      input.pictureBook === true,
      listingText.map((m) => m.label),
    ),
  );
  if (f.interiorPdf) z.file(`manuscript/${slug}-interior-${input.trim}.pdf`, f.interiorPdf);
  if (f.epub) z.file(`manuscript/${slug}.epub`, f.epub);
  if (f.docx) z.file(`manuscript/${slug}.docx`, f.docx);
  if (f.txt) z.file(`manuscript/${slug}.txt`, f.txt);
  if (f.md) z.file(`manuscript/${slug}.md`, f.md);
  if (f.ebookCover) z.file(`cover/${slug}-ebook-cover.jpg`, f.ebookCover);
  if (f.wrapPdf) z.file(`cover/${slug}-paperback-wrap-${input.trim}-${input.paper}-${input.pages ?? 0}p.pdf`, f.wrapPdf);
  z.file('listing/metadata.txt', metadataSheet(input.book, input.metadata));
  z.file('listing/description.html', `${input.book.meta.listing?.description ?? ''}\n`);
  for (const m of listingText) z.file(m.path, m.text.endsWith('\n') ? m.text : `${m.text}\n`);
  z.file('listing/ai-disclosure.txt', aiDisclosureNote(input.ai, input.rules, { pictureBook: input.pictureBook === true }));
  if (input.preflight) {
    z.file('reports/preflight.txt', preflightText(input.preflight, `Preflight: ${input.book.meta.title}`));
    z.file('reports/preflight.html', preflightHtml(input.preflight, `Preflight: ${input.book.meta.title}`));
  }
  z.file('reports/claims-to-verify.csv', claimsCsv(input.claims ?? []));
  const ids = input.ruleIds ?? input.rules.rules.map((r) => r.id);
  z.file(
    'reports/kdp-rules-used.txt',
    `KDP rules file ${input.rules.version} (verified ${input.rules.verifiedOn}, re-check due ${input.rules.recheckDue ?? ''})\n\n${describeRules(input.rules, ids).join('\n')}\n`,
  );
  // Marketing files only when the text exists: a pack built before marketing has no marketing/ folder.
  for (const m of marketing) z.file(m.path, m.text.endsWith('\n') ? m.text : `${m.text}\n`);
  const zip = await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { fileName: `${slug}-kdp-pack-${date}.zip`, zip };
}
