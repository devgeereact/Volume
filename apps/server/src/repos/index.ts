import type { Db } from '../db/connect.js';
import { BatchesRepo } from './batches.js';
import { BooksRepo } from './books.js';
import { LibraryRepo } from './library.js';
import { ManuscriptRepo } from './manuscript.js';
import { MembersRepo } from './members.js';
import { PictureRepo } from './picture.js';
import { PlanningRepo } from './planning.js';
import { ProductionRepo } from './production.js';
import { ProfilesRepo } from './profiles.js';
import { ScheduleRepo } from './schedule.js';
import { SettingsRepo } from './settings.js';

/** One repository per aggregate. Every method takes ctx and filters by workspace_id. */
export interface Repos {
  settings: SettingsRepo;
  profiles: ProfilesRepo;
  books: BooksRepo;
  planning: PlanningRepo;
  manuscript: ManuscriptRepo;
  production: ProductionRepo;
  library: LibraryRepo;
  members: MembersRepo;
  batches: BatchesRepo;
  schedule: ScheduleRepo;
  picture: PictureRepo;
}

export function createRepos(db: Db): Repos {
  return {
    settings: new SettingsRepo(db),
    profiles: new ProfilesRepo(db),
    books: new BooksRepo(db),
    planning: new PlanningRepo(db),
    manuscript: new ManuscriptRepo(db),
    production: new ProductionRepo(db),
    library: new LibraryRepo(db),
    members: new MembersRepo(db),
    batches: new BatchesRepo(db),
    schedule: new ScheduleRepo(db),
    picture: new PictureRepo(db),
  };
}
