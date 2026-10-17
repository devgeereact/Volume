// Helpers for image requests: purposes, reference images and seeds (D-045).
//
// OpenRouter POST /api/v1/images takes `input_references` (an array of { type: 'image_url', image_url: { url } },
// where url is an http(s) URL or a base64 data URL) and an integer `seed` "where supported". Support is advertised in
// `supported_parameters` (https://openrouter.ai/docs/guides/overview/multimodal/image-generation, read 17 October 2026).

import { BadRequestError } from './errors.ts';
import type { ImageReference, ModelInfo } from './types.ts';
import { sha256 } from './util.ts';

/** What an image is for. Picks the aspect ratio from `cover_image.aspectRatios` in config/models.defaults.json. */
export const IMAGE_PURPOSES = ['cover', 'spread', 'character-reference'] as const;
export type ImagePurpose = (typeof IMAGE_PURPOSES)[number];

/** A reference image as the caller holds it: a URL (http, https or data) or raw bytes with their media type. */
export type ImageReferenceInput = { url: string } | { data: Uint8Array; mediaType: string };

const MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
/** Largest seed sent. Providers differ; a non-negative 31-bit integer is accepted by all that take a seed. */
export const MAX_IMAGE_SEED = 2_147_483_647;

/** Turn a reference into the URL form OpenRouter accepts. Bytes become a base64 data URL. */
export function toImageReference(ref: ImageReferenceInput): ImageReference {
  if ('url' in ref) {
    const url = ref.url.trim();
    if (/^https?:\/\//i.test(url) || /^data:image\/(png|jpeg|webp);base64,/i.test(url)) return { url };
    throw new BadRequestError('A reference image must be an http(s) link or a PNG, JPEG or WebP data URL.');
  }
  if (!MEDIA_TYPES.has(ref.mediaType)) throw new BadRequestError(`A reference image must be PNG, JPEG or WebP, not ${ref.mediaType}.`);
  if (ref.data.byteLength === 0) throw new BadRequestError('A reference image is empty.');
  return { url: `data:${ref.mediaType};base64,${Buffer.from(ref.data).toString('base64')}` };
}

/** A stable seed for a key such as a book id, so every spread in a book uses the same seed. */
export function seedFromKey(key: string): number {
  return Number.parseInt(sha256(key).slice(0, 8), 16) % (MAX_IMAGE_SEED + 1);
}

export function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_IMAGE_SEED) {
    throw new BadRequestError(`The image seed must be a whole number from 0 to ${MAX_IMAGE_SEED}.`);
  }
}

/**
 * Whether to send a seed: only when the model list says the model takes one (D-045) and no model rule omits it.
 * Without a model list the seed is not sent, because an unsupported field can be refused.
 */
export function modelTakesSeed(info: ModelInfo | undefined, omitted: Set<string>): boolean {
  return !!info && info.supportedParameters.includes('seed') && !omitted.has('seed');
}

/**
 * Whether to send reference images. The docs do not name a capability key for them, so they are sent unless
 * the model list shows the model takes no image input.
 */
export function modelTakesReferences(info: ModelInfo | undefined): boolean {
  return !info || info.inputModalities.includes('image');
}
