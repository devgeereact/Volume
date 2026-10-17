import type { HandlerMap } from '../runner.js';
import { batchBookHandler, batchRunHandler } from './batch.js';
import { blueprintHandler, blueprintPartHandler, researchHandler, titlesHandler } from './planning.js';
import { pictureBookHandler, pictureCharactersHandler, pictureExportHandler, pictureStoryHandler, spreadImageHandler } from './picture-book.js';
import { coverBuildHandler, coverConceptsHandler, exportPackHandler, marketingHandler } from './production.js';
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
  export_pack: exportPackHandler,
  rewrite_selection: rewriteSelectionHandler,
  batch_run: batchRunHandler,
  batch_book: batchBookHandler,
  picture_book: pictureBookHandler,
  picture_story: pictureStoryHandler,
  picture_characters: pictureCharactersHandler,
  spread_image: spreadImageHandler,
  picture_export: pictureExportHandler,
  noop: (jc) => Promise.resolve({ result: { echo: jc.payload } }),
};
