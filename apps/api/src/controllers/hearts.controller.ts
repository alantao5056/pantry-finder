import { Response } from 'express';
import { AuthedRequest } from '../middleware/auth.middleware';
import { HeartsService } from '../services/hearts.service';

const heartsService = new HeartsService();

export class HeartsController {
  async heart(req: AuthedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const { pantryId } = req.params;
      await heartsService.heart(userId, pantryId as string);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error hearting pantry:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }

  async unheart(req: AuthedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const { pantryId } = req.params;
      await heartsService.unheart(userId, pantryId as string);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error unhearting pantry:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }

  async getHearts(req: AuthedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const pantryIds = await heartsService.getHeartedPantryIds(userId);
      res.status(200).json({ pantryIds });
    } catch (error) {
      console.error('Error fetching hearts:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
}
