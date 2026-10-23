// Source markers never reach the printed or downloaded book.
import { describe, expect, it } from 'vitest';
import { stripSourceMarkers, tidyProse } from '../src/adapters/volume-export.js';

describe('stripSourceMarkers', () => {
  it('removes single, repeated and spaced markers without leaving a gap before punctuation', () => {
    expect(stripSourceMarkers('Many nurses feel this. [[S1]][[S2]]\nNext line.')).toBe('Many nurses feel this.\nNext line.');
    expect(stripSourceMarkers('The Code is clear [[S3]].')).toBe('The Code is clear.');
    expect(stripSourceMarkers('Rest is vital [[S1]], and so is food [[ S2 ]] for most.')).toBe('Rest is vital, and so is food for most.');
    expect(stripSourceMarkers('Before [[S1]] [[S4]] after')).toBe('Before after');
  });
  it('leaves text without markers alone', () => {
    expect(stripSourceMarkers('Plain [text] with [[not a source]].')).toBe('Plain [text] with [[not a source]].');
  });
});

describe('tidyProse', () => {
  it('fixes spacing and the space before punctuation', () => {
    expect(tidyProse('Rest  well , eat well .  Then   sleep !')).toBe('Rest well, eat well. Then sleep!');
    expect(tidyProse('What is SBAR ? It is a tool : use it ;  often.   ')).toBe('What is SBAR? It is a tool: use it; often.');
  });
  it('keeps list indentation, table rows, code and numbers', () => {
    expect(tidyProse('  - one  two')).toBe('  - one two');
    expect(tidyProse('| A  | B |')).toBe('| A  | B |');
    expect(tidyProse('```\na  ,  b\n```')).toBe('```\na  ,  b\n```');
    expect(tidyProse('It costs 3.50 and 12,000 times')).toBe('It costs 3.50 and 12,000 times');
  });
});
