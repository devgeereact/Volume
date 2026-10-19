// house-style:off (live run 3 text quoted as fixtures)
import { describe, expect, it } from 'vitest';
import {
  checkedMonth,
  classifyPrices,
  findPricePromise,
  findProfileReuse,
  findProfileUses,
  findTemplateJunk,
  findUndatedPrices,
  findUnsourcedPrices,
  profileFactsUsedIn,
  tidyGlossary,
  tidyGlossaryMarkdown,
  textUsesTerm,
} from '../src/index.ts';

// Live run 3 ("Small Offer, Real Customers", 5 October 2026), quoted from the exported manuscript.
const BIO =
  'Gideon Akinlotan is a London-based writer and the person behind the Real Mr Gee and GAkinz brands. Through GAkinz, a web design and development studio, he designs and builds websites for small businesses, holding design and build to one standard so a site looks right and works right, with accessibility built in from the start.';
const INTRO =
  "Here's why I wrote it. I'm a writer based in London, and through my studio, GAkinz, I design and build websites for small businesses. I hold design and build to one standard, so a site has to look right and work right, with accessibility built in from the start. That habit has shaped how I think about everything else.";
const CHAPTER_2 =
  "Here is where I bring in my own standard. At GAkinz, my studio, I design and build websites for small businesses, and I hold design and build to one standard: a site has to look right and work right. Accessibility is built in from the start. I don't add it at the end as a favour.";
const CHAPTER_3 = 'Kofi builds websites for small businesses too, and he tests every chatbot with awkward questions before a customer sees it.';

describe('template junk (live run 3: "- x: x" passed the placeholder check)', () => {
  it('finds echo lines, TBD, lorem, [NEEDS ...], {placeholder} and empty list items', () => {
    const text = [
      '- Side Hustle School: AI side hustles guide (sidehustleschool.com): You might read this guide.',
      '- x: x',
      'Price: TBD',
      'Lorem ipsum dolor sit amet.',
      'See [NEEDS SOURCE] and [insert name here].',
      'Dear {readerName},',
      '-',
      '* * *',
      '---',
    ].join('\n');
    const kinds = findTemplateJunk(text).map((h) => `${h.kind}:${h.match}`);
    expect(kinds).toEqual([
      'echo:- x: x',
      'tbd:TBD',
      'lorem:Lorem',
      'lorem:ipsum dolor',
      'bracket:[NEEDS SOURCE]',
      'bracket:[insert name here]',
      'brace:{readerName}',
      'empty-item:-',
    ]);
  });

  it('leaves ordinary prose, markdown links and source markers alone', () => {
    const text = [
      'Search the list yourself, using the [regulator website](https://www.fca.org.uk), before paying anyone.',
      'The fact sits in a source [[S2]] and a todo list is a fine thing to keep.',
      'Q: What does it cost? A: Nothing.',
      '- Choose tools by the job they do.',
    ].join('\n');
    expect(findTemplateJunk(text)).toEqual([]);
  });
});

describe('dated prices (live run 3 promised dates that were never written)', () => {
  it('asks for a month only on sourced prices with no month and year in the same sentence', () => {
    const text =
      'Three hours a month, a floor of £45 [[S1]], a price of £60 for one newsletter a month [[S2]]. Suppose she pays £15 a month (checked October 2026) for a plan [[S1]]. Canva Pro was 10 pounds a month in Sept 2026 [[S3]].';
    expect(findUndatedPrices(text).map((h) => h.match)).toEqual(['£45', '£60']);
  });

  it('accepts a dated sourced price and decimals', () => {
    expect(findUndatedPrices('The plan costs £15.50 a month (checked October 2026) [[S1]].')).toEqual([]);
    expect(findUndatedPrices('It costs $9.99 a month [[S2]].').map((h) => h.match)).toEqual(['$9.99']);
  });
});

describe('prices: sourced, hypothetical or unsourced (live acceptance run, 18 October 2026)', () => {
  it('leaves hypothetical round "you" figures alone and never asks for a stamp on them', () => {
    const text = 'Set yourself a ceiling of £10 a month. Suppose you earn £200 from a first client. If it costs £50, stop.';
    expect(classifyPrices(text).map((p) => p.kind)).toEqual(['hypothetical', 'hypothetical', 'hypothetical']);
    expect(findUndatedPrices(text)).toEqual([]);
    expect(findUnsourcedPrices(text)).toEqual([]);
  });

  it('sends unsourced specific prices to the claims report, stamped or not', () => {
    const text = 'ChatGPT Plus costs £20 a month. At £0.002 per thousand tokens (checked October 2026) it is cheap. You pay $9.99 for it.';
    expect(findUnsourcedPrices(text).map((h) => h.match)).toEqual(['£20', '£0.002', '$9.99']);
    expect(findUndatedPrices(text)).toEqual([]);
  });

  it('a sourced price stays sourced even in a "you" sentence', () => {
    const p = classifyPrices('You will pay £20 a month for the plan [[S4]].');
    expect(p).toMatchObject([{ match: '£20', kind: 'sourced', dated: false }]);
  });

  it('formats the write month and finds the promise sentence', () => {
    expect(checkedMonth(new Date(Date.UTC(2026, 9, 5)))).toBe('October 2026');
    const how =
      'Tools change quickly. Wherever I mention a price, it carries the month it was checked, and you should check it again before you pay for anything.';
    expect(findPricePromise(how)).toBe(
      'Wherever I mention a price, it carries the month it was checked, and you should check it again before you pay for anything.',
    );
    expect(findPricePromise('Every price in this book is dated.')).toBe('Every price in this book is dated.');
    expect(findPricePromise('Prices change, so check them before you pay.')).toBeNull();
  });
});

describe('glossary post-step (live run 3: duplicates and unused terms)', () => {
  const body = `${INTRO} ${CHAPTER_2} One clear offer. Your small offer is one thing you sell. Start on a free plan. Use an AI chat assistant. No names in a prompt.`;
  it('merges duplicates, drops terms the book never uses and sorts the rest', () => {
    const t = tidyGlossary(
      [
        { term: 'Prompt', definition: 'The instruction you give an AI tool.' },
        { term: 'Offer', definition: 'One clear thing you sell, to one kind of customer, at one price.' },
        { term: 'Niche', definition: 'A small, specific group of customers with a shared problem.' },
        { term: 'No-code', definition: 'Tools you set up by clicking rather than writing code.' },
        { term: 'Small Offer', definition: 'One clear thing you sell, to one kind of customer, at one price.' },
        { term: 'Free Plan', definition: 'A version of a tool you can use without paying.' },
        { term: 'Voice Agent', definition: 'A tool that answers phone calls automatically.' },
        { term: 'AI Chat Assistant', definition: 'A tool you type instructions into.' },
      ],
      body,
    );
    expect(t.entries.map((e) => e.term)).toEqual(['AI Chat Assistant', 'Free Plan', 'Prompt', 'Small Offer']);
    expect(t.merged).toEqual([['Offer', 'Small Offer']]);
    expect(t.unused).toEqual(['Niche', 'No-code', 'Voice Agent']);
  });

  it('works on the glossary Markdown and keeps everything when there is no book text', () => {
    const md = '**Voice Agent**: A tool that answers calls.\n\n**Accessibility**: Making work usable by as many people as possible.';
    expect(tidyGlossaryMarkdown(md, body).markdown).toBe('**Accessibility**: Making work usable by as many people as possible.');
    expect(tidyGlossaryMarkdown(md, '').markdown).toBe(
      '**Accessibility**: Making work usable by as many people as possible.\n\n**Voice Agent**: A tool that answers calls.',
    );
    expect(textUsesTerm('Try no code tools first.', 'No-code')).toBe(true);
    expect(textUsesTerm('Pick your niches.', 'Niche')).toBe(true);
  });
});

describe('profile facts reused (live run 3: the GAkinz bio sentence three times)', () => {
  const units = [
    { sectionId: 'intro', text: INTRO, title: 'Introduction' },
    { sectionId: 'ch2', text: CHAPTER_2, title: 'Chapter 2: Build It Small' },
    { sectionId: 'ch3', text: CHAPTER_3, title: 'Chapter 3: Find Customers' },
  ];
  it('finds body sentences that restate the bio, not ordinary sentences that share a few words', () => {
    const uses = findProfileUses(units, BIO);
    expect(uses.map((u) => u.sectionId)).toEqual(['intro', 'intro', 'ch2']);
    expect(profileFactsUsedIn(units, BIO)).toEqual(['Introduction', 'Chapter 2: Build It Small']);
    expect(profileFactsUsedIn([units[2]!], BIO)).toEqual([]);
  });

  it('keeps the first use and flags the later section', () => {
    const [f] = findProfileReuse(units, BIO);
    expect(f?.kind).toBe('profile');
    expect(f?.occurrences.filter((o) => o.sectionId === 'ch2')).toHaveLength(1);
    expect(f?.occurrences[0]?.sectionId).toBe('intro');
    expect(findProfileReuse(units.slice(0, 1), BIO)).toEqual([]);
  });
});
