import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../app.js';
import { assetRoutes } from './assets.js';
import { bookRoutes } from './books.js';
import { estimateRoutes } from './estimate.js';
import { jobRoutes } from './jobs.js';
import { manuscriptRoutes } from './manuscript.js';
import { planningRoutes } from './planning.js';
import { productionRoutes } from './production.js';
import { profileRoutes } from './profiles.js';
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
  productionRoutes(app, s);
  jobRoutes(app, s);
  assetRoutes(app, s);
  transferRoutes(app, s);
}
