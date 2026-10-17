import type { CharacterView, PictureBookView, SpreadLayout, SpreadView } from "../api/picture";

/* Demo picture books for the spreads board and the picture-book export (phase 7). Everything here is demo
   data: the story text is written for the demo and the pictures are flat placeholder drawings, not AI art.
   The page size and the page plan are not here: the screens add them from the KDP rules file through
   features/spreads/geometry.ts, so this file holds no KDP number.

   Not re-exported from demo/index.ts on purpose: it is only used by the picture-book screens' own chunk. */

export interface DemoPictureStory {
  title: string;
  newWord: string;
  styleLine: string;
  /** Ages, as the wizard writes them. */
  ageRange: string;
  topic: string;
  spreads: { text: string; layout: SpreadLayout; scene: string; characters: string[] }[];
  characters: { name: string; sheet: string; main: boolean; colour: string }[];
}

/* ---------- Placeholder pictures ---------- */

// Book content, not interface colour: soft night and dusk palettes for the placeholder drawings.
const skies = ["#27325f", "#33407a", "#3d4b86", "#2b3a6b", "#4a4f8c", "#35467e", "#283a66", "#424a85", "#2f3c72", "#3a4680"];
const hills = ["#3f6b5c", "#4b7a63", "#3a6455", "#557f69", "#45705e"];

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A 2:1 placeholder: sky, moon, stars, hills and a round figure on the side away from the text. */
function spreadPicture(n: number, layout: SpreadLayout, figure: string): string {
  const sky = skies[(n - 1) % skies.length] ?? skies[0];
  const hill = hills[(n - 1) % hills.length] ?? hills[0];
  const figX = layout === "text-left" ? 720 : layout === "text-right" ? 280 : 500;
  const figY = layout === "text-bottom" ? 250 : 330;
  const moonX = layout === "text-left" ? 860 : 140;
  const stars = Array.from({ length: 18 }, (_, i) => {
    const x = (i * 137 + n * 53) % 1000;
    const y = (i * 71 + n * 29) % 220;
    return `<circle cx="${x}" cy="${y + 14}" r="${(i % 3) + 1.5}" fill="#fff6d8" opacity="0.85"/>`;
  }).join("");
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice">` +
      `<rect width="1000" height="500" fill="${sky}"/>${stars}` +
      `<circle cx="${moonX}" cy="90" r="46" fill="#fff1c1"/>` +
      `<path d="M0 380 C 180 320, 340 360, 500 350 S 820 320, 1000 370 L 1000 500 L 0 500 Z" fill="${hill}"/>` +
      `<ellipse cx="${figX}" cy="${figY + 48}" rx="70" ry="14" fill="#1d2a4a" opacity="0.35"/>` +
      `<circle cx="${figX}" cy="${figY}" r="54" fill="${figure}"/>` +
      `<circle cx="${figX - 18}" cy="${figY - 10}" r="6" fill="#1d2238"/><circle cx="${figX + 18}" cy="${figY - 10}" r="6" fill="#1d2238"/>` +
      `<path d="M ${figX - 16} ${figY + 14} Q ${figX} ${figY + 28} ${figX + 16} ${figY + 14}" stroke="#1d2238" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `</svg>`,
  );
}

/** A square reference placeholder: one neutral full-body figure on a plain ground. */
function referencePicture(colour: string): string {
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">` +
      `<rect width="400" height="400" fill="#f4efe3"/>` +
      `<ellipse cx="200" cy="350" rx="90" ry="14" fill="#d9d1bf"/>` +
      `<rect x="150" y="190" width="100" height="150" rx="50" fill="${colour}"/>` +
      `<circle cx="200" cy="150" r="70" fill="${colour}"/>` +
      `<circle cx="176" cy="140" r="8" fill="#1d2238"/><circle cx="224" cy="140" r="8" fill="#1d2238"/>` +
      `<path d="M 180 170 Q 200 186 220 170" stroke="#1d2238" stroke-width="6" fill="none" stroke-linecap="round"/>` +
      `</svg>`,
  );
}

/* ---------- The stories ---------- */

const pip: DemoPictureStory = {
  title: "Pip and the Sleepy Stars",
  newWord: "patient",
  styleLine: "Soft, rounded shapes and warm lamplight on deep blue evenings.",
  ageRange: "3 to 7",
  topic: "Pip the hedgehog wants the stars to come out before bedtime, and learns that some lovely things are worth waiting for.",
  characters: [
    {
      name: "Pip",
      main: true,
      colour: "#c99a6b",
      sheet: "Pip is a small, round hedgehog with soft caramel spines, a cream tummy, bright dark eyes and a tiny pink nose. Pip wears a striped green scarf.",
    },
    {
      name: "Grandma Owl",
      main: true,
      colour: "#9c8bb8",
      sheet: "Grandma Owl is a calm, plump owl with lavender-grey feathers, large amber eyes, round reading glasses and a knitted shawl the colour of honey.",
    },
  ],
  spreads: [
    {
      text: "Pip the hedgehog looked up at the sky. It was pink and orange and not one bit starry.",
      layout: "text-left",
      scene: "Pip on a hill at sunset, looking up.",
      characters: ["Pip"],
    },
    {
      text: '"Where are the stars?" asked Pip. "I want to say goodnight to them."',
      layout: "text-right",
      scene: "Pip asking the empty sky, paws on hips.",
      characters: ["Pip"],
    },
    {
      text: 'Grandma Owl fluffed her feathers. "Stars come when they are ready, little one. We must be patient."',
      layout: "text-left",
      scene: "Grandma Owl on a low branch beside Pip.",
      characters: ["Pip", "Grandma Owl"],
    },
    {
      text: '"Patient means waiting kindly," said Grandma Owl, "even when waiting feels long."',
      layout: "text-bottom",
      scene: "The two friends sitting together on a mossy log.",
      characters: ["Pip", "Grandma Owl"],
    },
    {
      text: "So Pip waited. Pip counted the fireflies. One, two, three, a soft yellow glow.",
      layout: "text-top",
      scene: "Fireflies around Pip in the long grass.",
      characters: ["Pip"],
    },
    {
      text: "Pip hummed a sleepy song. The sky turned lilac, then blue, as soft as a bunny's ear.",
      layout: "text-right",
      scene: "Pip humming, the sky darkening gently.",
      characters: ["Pip"],
    },
    {
      text: '"I am being patient," Pip whispered. "Patient, patient, patient." Grandma Owl smiled.',
      layout: "text-left",
      scene: "Pip whispering, Grandma Owl smiling nearby.",
      characters: ["Pip", "Grandma Owl"],
    },
    {
      text: "Then, high above the hill, one tiny star blinked awake. Then another, and another.",
      layout: "text-bottom",
      scene: "The first stars appearing over the hill.",
      characters: ["Pip", "Grandma Owl"],
    },
    {
      text: '"Goodnight, stars!" called Pip. The stars twinkled back, warm and bright.',
      layout: "text-left",
      scene: "Pip waving at a sky full of stars.",
      characters: ["Pip"],
    },
    {
      text: "Pip curled up snug in the moss. Waiting had been worth it. Goodnight, Pip.",
      layout: "text-right",
      scene: "Pip asleep in the moss under the stars.",
      characters: ["Pip"],
    },
  ],
};

const milo: DemoPictureStory = {
  title: "Milo and the Moon Kite",
  newWord: "gentle",
  styleLine: "Bright, soft 3D look with rounded shapes and warm evening light.",
  ageRange: "3 to 7",
  topic: "Milo the fox makes a kite to fly up to the moon, and learns to be gentle with the wind.",
  characters: [
    {
      name: "Milo",
      main: true,
      colour: "#d9824b",
      sheet: "Milo is a little red fox with a fluffy white-tipped tail, big curious eyes and a blue knitted hat with a bobble.",
    },
    {
      name: "Wren",
      main: true,
      colour: "#8aa66b",
      sheet: "Wren is a tiny brown bird with a speckled chest, a cheerful round body and a green ribbon tied to one leg.",
    },
  ],
  spreads: [
    {
      text: "Milo the fox had made a kite. It was round and silver, just like the moon.",
      layout: "text-left",
      scene: "Milo holding a round silver kite.",
      characters: ["Milo"],
    },
    { text: '"I will fly it all the way up to say hello," said Milo.', layout: "text-right", scene: "Milo pointing at the rising moon.", characters: ["Milo"] },
    {
      text: "Milo tugged hard on the string. The kite wobbled and bumped down in the grass.",
      layout: "text-top",
      scene: "The kite tumbling into the grass.",
      characters: ["Milo"],
    },
    {
      text: 'Wren landed on a fence post. "Be gentle," she chirped. "Gentle means soft and kind."',
      layout: "text-left",
      scene: "Wren on a fence post talking to Milo.",
      characters: ["Milo", "Wren"],
    },
    {
      text: "Milo held the string softly. He let the wind lift the kite, little by little.",
      layout: "text-bottom",
      scene: "The kite rising slowly.",
      characters: ["Milo", "Wren"],
    },
    {
      text: "Up went the kite, past the trees, past the clouds, gentle and slow.",
      layout: "text-right",
      scene: "The kite high above the trees.",
      characters: ["Milo"],
    },
    {
      text: '"Gentle hands, gentle wind," sang Milo and Wren together.',
      layout: "text-left",
      scene: "Milo and Wren singing on the hill.",
      characters: ["Milo", "Wren"],
    },
    {
      text: "The silver kite floated beside the moon. They looked like two friends.",
      layout: "text-bottom",
      scene: "The kite next to the moon.",
      characters: ["Milo", "Wren"],
    },
    {
      text: '"Hello, Moon," whispered Milo. The moon glowed warm and gentle back.',
      layout: "text-left",
      scene: "Milo whispering up at the moon.",
      characters: ["Milo"],
    },
    {
      text: "Milo wound the string home and snuggled into bed. Goodnight, Milo.",
      layout: "text-right",
      scene: "Milo asleep with the kite by his bed.",
      characters: ["Milo"],
    },
  ],
};

export const demoPictureStories: Record<string, DemoPictureStory> = {
  "pip-and-the-sleepy-stars": pip,
  "milo-and-the-moon-kite": milo,
};

/** Demo books whose picture book is already made when the screen opens. Milo starts at the story form. */
export const demoPictureBooksMade = new Set(["pip-and-the-sleepy-stars"]);

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function demoSpreads(bookId: string, story: DemoPictureStory, updatedAt: number): SpreadView[] {
  const figure = story.characters[0]?.colour ?? "#c99a6b";
  return story.spreads.map((s, i) => ({
    sectionId: `${bookId}-spread-${i + 1}`,
    n: i + 1,
    text: s.text,
    versionId: `${bookId}-spread-${i + 1}-v1`,
    wordCount: words(s.text),
    layout: s.layout,
    sceneSummary: s.scene,
    imagePrompt: `${s.scene} ${story.styleLine}`,
    characters: s.characters,
    imageAssetId: `${bookId}-image-${i + 1}`,
    imageUrl: spreadPicture(i + 1, s.layout, figure),
    enabled: true,
    status: "done",
    updatedAt,
  }));
}

/** A new placeholder for a repainted spread: the same scene with the figure moved, so the change shows. */
export function demoRepaint(spread: SpreadView, story: DemoPictureStory, round: number): string {
  const colours = story.characters.map((c) => c.colour);
  const figure = colours[round % colours.length] ?? "#c99a6b";
  return spreadPicture(spread.n + round, spread.layout, figure);
}

export function demoCharacters(bookId: string, story: DemoPictureStory): CharacterView[] {
  return story.characters.map((c, i) => ({
    id: `${bookId}-character-${i + 1}`,
    name: c.name,
    sheet: c.sheet,
    main: c.main,
    referencePrompt: `${c.sheet} Neutral pose, full body, plain background, no text.`,
    referenceAssetId: `${bookId}-reference-${i + 1}`,
    referenceUrl: referencePicture(c.colour),
  }));
}

/** The view without page size and plan (geometry.ts adds those from the rules file). */
export type DemoPictureView = Omit<PictureBookView, "pageSizeIn" | "plan" | "pageCount">;

export function demoPictureView(bookId: string, story: DemoPictureStory, updatedAt: number): DemoPictureView {
  return {
    bookId,
    trim: "8.5x8.5",
    ink: "premium",
    story: { topic: story.topic, ageRange: story.ageRange, newWord: story.newWord },
    title: story.title,
    newWord: story.newWord,
    styleLine: story.styleLine,
    safety: { passed: true, notes: [] },
    spreads: demoSpreads(bookId, story, updatedAt),
    job: null,
  };
}

/** Demo preflight for a built picture book: the picture-book checks, all passing, plus one owner reminder. */
export const demoPicturePreflight = [
  { id: "interior.bleed", area: "interior", severity: "pass" as const, message: "Every page is the trim size plus bleed." },
  { id: "picture.spread-images", area: "interior", severity: "pass" as const, message: "Every spread has its picture, split across the gutter." },
  { id: "picture.safe-area", area: "interior", severity: "pass" as const, message: "All story text sits inside the safe area." },
  { id: "picture.page-count", area: "interior", severity: "pass" as const, message: "The page count meets the premium colour minimum for this trim." },
  { id: "kdp.ai-disclosure", area: "listing", severity: "pass" as const, message: "AI disclosure is set to AI-generated for text and images." },
  { id: "listing.price", area: "listing", severity: "warn" as const, message: "Set a list price before you upload to KDP." },
];
