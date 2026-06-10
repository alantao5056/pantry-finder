import { Request, Response } from 'express';
import {
  GetCitiesResponseDto,
  GetStatesResponseDto,
  GetCityPantriesResponseDto,
} from '@pantry-finder/shared';
import { CityService } from '../services/city.service';
import { MAX_CITIES_LIMIT } from '../config/constants';

const cityService = new CityService();

export class CityController {
  public async getStates(
    req: Request,
    res: Response<GetStatesResponseDto | { error: string }>
  ): Promise<void> {
    try {
      const states = await cityService.getStates();
      res.status(200).json({ states });
    } catch (error) {
      console.error('Error fetching states:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }

  public async getCities(
    req: Request<{ state: string }, {}, {}, { limit?: string }>,
    res: Response<GetCitiesResponseDto | { error: string }>
  ): Promise<void> {
    try {
      const { limit } = req.query;

      // State-scoped by design — the full list is ~4,400 cities and nothing
      // needs it unbounded (the sitemap reads Firestore directly).
      const stateSlug = req.params.state.trim().toLowerCase();
      if (!/^[a-z]{2}$/.test(stateSlug)) {
        res.status(404).json({ error: 'State not found.' });
        return;
      }

      let parsedLimit: number | undefined;
      if (limit !== undefined) {
        parsedLimit = parseInt(String(limit), 10);
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_CITIES_LIMIT) {
          res.status(400).json({ error: `Limit must be between 1 and ${MAX_CITIES_LIMIT}.` });
          return;
        }
      }

      const cities = await cityService.getCities(stateSlug, parsedLimit);

      if (cities === null) {
        res.status(404).json({ error: 'No pantries found for this state.' });
        return;
      }

      res.status(200).json({ cities });
    } catch (error) {
      console.error('Error fetching cities:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }

  public async getCityPantries(
    req: Request<{ state: string; city: string }, {}, {}, { page?: string }>,
    res: Response<GetCityPantriesResponseDto | { error: string }>
  ): Promise<void> {
    try {
      const stateSlug = req.params.state.trim().toLowerCase();
      const citySlug = req.params.city.trim().toLowerCase();

      if (!/^[a-z]{2}$/.test(stateSlug) || !/^[a-z0-9-]+$/.test(citySlug)) {
        res.status(404).json({ error: 'City not found.' });
        return;
      }

      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      if (isNaN(page) || page < 1) {
        res.status(400).json({ error: 'Page must be a positive integer.' });
        return;
      }

      const responseDto = await cityService.getCityPantries(stateSlug, citySlug, page);

      if (responseDto === null) {
        res.status(404).json({ error: 'City not found.' });
        return;
      }

      res.status(200).json(responseDto);
    } catch (error) {
      console.error('Error fetching city pantries:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
}
