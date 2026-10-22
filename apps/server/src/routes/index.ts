import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../app.js';
import { accountRoutes } from './account.js';
import { assetRoutes } from './assets.js';
import { batchRoutes } from './batches.js';
import { rebuildRoutes } from './rebuild.js';
import { bookRoutes } from './books.js';
import { estimateRoutes } from './estimate.js';
import { fixRoutes } from './fixes.js';
import { jobRoutes } from './jobs.js';
import { manuscriptRoutes } from './manuscript.js';
import { memberRoutes } from './members.js';
import { planningRoutes } from './planning.js';
import { productionRoutes } from './production.js';
import { profileRoutes } from './profiles.js';
import { scheduleRoutes } from './schedule.js';
import { spreadRoutes } from './spreads.js';
import { systemRoutes } from './system.js';
import { transferRoutes } from './transfer.js';

/** Everything under /api/v1. */
export function registerRoutes(app: FastifyInstance, s: AppServices): void {
  systemRoutes(app, s);
  profileRoutes(app, s);
  bookRoutes(app, s);
  estimateRoutes(app, s);
  planningRoutes(app, s);
  manuscriptRoutes(app, s);
  fixRoutes(app, s);
  productionRoutes(app, s);
  jobRoutes(app, s);
  assetRoutes(app, s);
  transferRoutes(app, s);
  memberRoutes(app, s);
  accountRoutes(app, s);
  batchRoutes(app, s);
  rebuildRoutes(app, s);
  scheduleRoutes(app, s);
  spreadRoutes(app, s);
}
