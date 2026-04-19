import './config/env';
import express, { Request, Response } from 'express';
import cors from 'cors';
import pantryRoutes from './routes/pantry.routes';

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Pantry Finder API is running' });
});

// API Routes
app.use('/pantries', pantryRoutes);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
