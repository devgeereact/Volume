import type { HandlerMap } from '../runner.js';
import { batchBookHandler, batchRunHandler } from './batch.js';
import { rebuildBookHandler } from './rebuild.js';
import { claimFixHandler } from './claims.js';
import { blueprintHandler, blueprintPartHandler, researchHandler, titlesHandler } from './planning.js';
import { pictureBookHandler, pictureCharactersHandler, pictureExportHandler, pictureStoryHandler, spreadImageHandler } from './picture-book.js';
import { coverBuildHandler, coverConceptsHandler, exportPackHandler, listingHandler, marketingHandler } from './production.js';
import { editPassHandler, rewriteSelectionHandler, weaveNotesHandler, writeBookHandler, writeSectionHandler } from './writing.js';

export const defaultHandlers: HandlerMap = {
  research: researchHandler,
  titles: titlesHandler,
  blueprint: blueprintHandler,
  blueprint_part: blueprintPartHandler,
  write_book: writeBookHandler,
  write_section: writeSectionHandler,
  weave_notes: weaveNotesHandler,
  edit_pass: editPassHandler,
  cover_concepts: coverConceptsHandler,
  cover_build: coverBuildHandler,
  marketing: marketingHandler,
  listing: listingHandler,
  export_pack: exportPackHandler,
  rewrite_selection: rewriteSelectionHandler,
  claim_fix: claimFixHandler,
  batch_run: batchRunHandler,
  batch_book: batchBookHandler,
  rebuild_book: rebuildBookHandler,
  picture_book: pictureBookHandler,
  picture_story: pictureStoryHandler,
  picture_characters: pictureCharactersHandler,
  spread_image: spreadImageHandler,
  picture_export: pictureExportHandler,
  noop: (jc) => Promise.resolve({ result: { echo: jc.payload } }),
};
