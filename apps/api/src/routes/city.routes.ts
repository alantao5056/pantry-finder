import { Router } from 'express';
import { CityController } from '../controllers/city.controller';

const cityController = new CityController();

// Serves the in-memory cities index. No auth (fully public, no user-specific
// data) and no rateLimitSearch (no geocoding cost — see the note on the
// /pantries/:id route).

export const statesRouter = Router();
statesRouter.get('/', cityController.getStates.bind(cityController));
statesRouter.get('/:state/cities', cityController.getCities.bind(cityController));
statesRouter.get('/:state/cities/:city', cityController.getCityPantries.bind(cityController));
