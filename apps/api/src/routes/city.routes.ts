import { Router } from 'express';
import { CityController } from '../controllers/city.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { rateLimitBrowse } from '../middleware/rateLimit.middleware';

const cityController = new CityController();

// Serves the cached cities index. Fully public (optionalAuth only picks the
// rate-limit bucket) and not behind rateLimitSearch (no geocoding cost);
// rateLimitBrowse keeps one client from walking every city at full speed.

export const statesRouter = Router();
statesRouter.use(optionalAuth, rateLimitBrowse);
statesRouter.get('/', cityController.getStates.bind(cityController));
statesRouter.get('/:state/cities', cityController.getCities.bind(cityController));
statesRouter.get('/:state/cities/:city', cityController.getCityPantries.bind(cityController));
