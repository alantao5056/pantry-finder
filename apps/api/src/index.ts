import './config/env';
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pantryRoutes from './routes/pantry.routes';
import authRoutes from './routes/auth.routes';
import heartsRoutes from './routes/hearts.routes';
import { trackApiUsage } from './middleware/analytics.middleware';
import { requestLog } from './middleware/requestLog.middleware';

const app = express();
app.set('trust proxy', 'loopback');
const port = process.env.PORT || 8080;

const webOrigin = process.env.NODE_ENV === 'production'
  ? 'https://pantryfinder.org'
  : 'http://localhost:3000';

app.use(cors({ origin: webOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(trackApiUsage);
app.use(requestLog);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Pantry Finder API is running' });
});

app.use('/auth', authRoutes);
app.use('/pantries', pantryRoutes);
app.use('/hearts', heartsRoutes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
