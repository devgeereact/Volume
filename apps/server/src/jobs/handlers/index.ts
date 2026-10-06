import type { HandlerMap } from '../runner.js';
import { blueprintHandler, blueprintPartHandler, researchHandler, titlesHandler } from './planning.js';
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
  noop: (jc) => Promise.resolve({ result: { echo: jc.payload } }),
};
