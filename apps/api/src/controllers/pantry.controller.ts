import { Request, Response } from 'express';
import { Pantry } from '@pantry-finder/shared';
import { AuthedRequest } from '../middleware/auth.middleware';
import { TrackedRequest } from '../middleware/analytics.middleware';
import { PantryService } from '../services/pantry.service';
import { GetPantriesRequestDto } from '../models/dto/pantry.request.dto';
import { GetPantriesResponseDto } from '../models/dto/pantry.response.dto';
import { DEFAULT_RADIUS, MAX_PAGE } from '../config/constants';

const pantryService = new PantryService();

export class PantryController {
  public async getPantries(
    // Intersections carry what the service needs for the search-log entry:
    // optionalAuth may have attached the logged-in user, and trackApiUsage
    // always attaches the anonymous client id.
    req: Request<{}, {}, {}, Partial<GetPantriesRequestDto>> &
      Pick<AuthedRequest, 'user'> &
      Pick<TrackedRequest, 'clientId'>,
    res: Response<GetPantriesResponseDto | { error: string }>
  ): Promise<void> {
    try {
      const { location, radius, page } = req.query;

      if (!location || typeof location !== 'string') {
        res.status(400).json({ error: 'Location query parameter is required and must be a string.' });
        return;
      }

      // Query parameters are usually strings, parse them
      const parsedRadius = radius ? parseFloat(radius as unknown as string) : DEFAULT_RADIUS;
      if (isNaN(parsedRadius) || parsedRadius <= 0) {
        res.status(400).json({ error: 'Radius must be a positive number.' });
        return;
      }

      const parsedPage = page ? parseInt(page as unknown as string, 10) : 1;
      if (isNaN(parsedPage) || parsedPage < 1) {
        res.status(400).json({ error: 'Page must be a positive integer.' });
        return;
      }
      
      if (parsedPage > MAX_PAGE) {
        res.status(400).json({ error: `Page number exceeds maximum allowed value of ${MAX_PAGE}.` });
        return;
      }

      const requestDto: GetPantriesRequestDto = {
        location: location,
        radius: parsedRadius,
        page: parsedPage,
      };

      const responseDto = await pantryService.getPantriesByLocation(requestDto, {
        userEmail: req.user?.sub ?? null,
        clientId: req.clientId,
      });

      if (responseDto === null) {
        res.status(404).json({ error: 'Location could not be geocoded.' });
        return;
      }

      res.status(200).json(responseDto);
    } catch (error) {
      console.error('Error fetching pantries:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }

  public async getPantryById(
    req: Request<{ id: string }>,
    res: Response<Pantry | { error: string }>
  ): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'Pantry id is required.' });
        return;
      }

      const pantry = await pantryService.getPantryById(id);

      if (pantry === null) {
        res.status(404).json({ error: 'Pantry not found.' });
        return;
      }

      res.status(200).json(pantry);
    } catch (error) {
      console.error('Error fetching pantry:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
}
