import { Request, Response } from 'express';
import { PantryService } from '../services/pantry.service';
import { GetPantriesRequestDto } from '../models/dto/pantry.request.dto';
import { GetPantriesResponseDto } from '../models/dto/pantry.response.dto';
import { DEFAULT_RADIUS, MAX_PAGE } from '../config/constants';

const pantryService = new PantryService();

export class PantryController {
  public async getPantries(
    req: Request<{}, {}, {}, Partial<GetPantriesRequestDto>>,
    res: Response<GetPantriesResponseDto | { error: string }>
  ): Promise<void> {
    try {
      const { address, radius, page } = req.query;

      if (!address || typeof address !== 'string') {
        res.status(400).json({ error: 'Address query parameter is required and must be a string.' });
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
        address: address,
        radius: parsedRadius,
        page: parsedPage,
      };

      const responseDto = await pantryService.getPantriesByLocation(requestDto);

      if (responseDto === null) {
        res.status(404).json({ error: 'Address could not be geocoded.' });
        return;
      }

      res.status(200).json(responseDto);
    } catch (error) {
      console.error('Error fetching pantries:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
}
