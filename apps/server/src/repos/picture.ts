import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { PictureCharactersTable } from '../db/schema.js';
import { bool, flag, newId, now } from '../lib/util.js';

/** One character sheet of a picture book, with its reference picture (D-045). */
export interface PictureCharacter {
  id: string;
  projectId: string;
  name: string;
  position: number;
  /** Repeated word for word in every scene prompt. */
  sheet: string;
  /** True when the character appears in more than one spread (only main characters get a reference picture). */
  main: boolean;
  referencePrompt: string | null;
  referenceAssetId: string | null;
  updatedAt: number;
}

function toCharacter(r: PictureCharactersTable): PictureCharacter {
  return {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    position: r.position,
    sheet: r.sheet,
    main: bool(r.main),
    referencePrompt: r.referencePrompt,
    referenceAssetId: r.referenceAssetId,
    updatedAt: Number(r.updatedAt),
  };
}

/** Picture-book characters. Every method takes ctx and filters by workspace_id. */
export class PictureRepo {
  constructor(private readonly db: Db) {}

  async listCharacters(ctx: RequestCtx, projectId: string): Promise<PictureCharacter[]> {
    const rows = await this.db
      .selectFrom('pictureCharacters')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .orderBy('position')
      .execute();
    return rows.map(toCharacter);
  }

  /**
   * Replaces the book's character sheets with a new set (the scene prompts stage). A character whose name and sheet
   * are unchanged keeps its reference picture; a changed sheet drops it, so the next run paints a new one.
   */
  async replaceCharacters(ctx: RequestCtx, projectId: string, sheets: { name: string; sheet: string; main: boolean }[]): Promise<PictureCharacter[]> {
    const before = await this.listCharacters(ctx, projectId);
    const t = now();
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('pictureCharacters').where('workspaceId', '=', ctx.workspaceId).where('projectId', '=', projectId).execute();
      for (const [i, c] of sheets.entries()) {
        const same = before.find((b) => b.name === c.name && b.sheet === c.sheet);
        await trx
          .insertInto('pictureCharacters')
          .values({
            id: same?.id ?? newId(),
            workspaceId: ctx.workspaceId,
            projectId,
            name: c.name,
            position: i + 1,
            sheet: c.sheet,
            main: flag(c.main),
            referencePrompt: same?.referencePrompt ?? null,
            referenceAssetId: same?.referenceAssetId ?? null,
            createdAt: t,
            updatedAt: t,
          })
          .execute();
      }
    });
    return this.listCharacters(ctx, projectId);
  }

  async setReference(ctx: RequestCtx, id: string, set: { referencePrompt?: string | null; referenceAssetId?: string | null }): Promise<void> {
    const patch: Partial<PictureCharactersTable> = { updatedAt: now() };
    if (set.referencePrompt !== undefined) patch.referencePrompt = set.referencePrompt;
    if (set.referenceAssetId !== undefined) patch.referenceAssetId = set.referenceAssetId;
    await this.db.updateTable('pictureCharacters').set(patch).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
  }
}
