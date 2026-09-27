import './config/env';
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pantryRoutes from './routes/pantry.routes';
import { statesRouter } from './routes/city.routes';
import authRoutes from './routes/auth.routes';
import heartsRoutes from './routes/hearts.routes';
import adminRoutes from './routes/admin.routes';
import { trackApiUsage } from './middleware/analytics.middleware';
import { requestLog } from './middleware/requestLog.middleware';
import { closeRedis } from './cache/redisClient';

const app = express();
app.set('trust proxy', 'loopback');
const port = process.env.PORT || 8080;

// The public site and the admin site (apps/admin).
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://pantryfinder.org', 'https://admin.pantryfinder.org']
  : ['http://localhost:3000', 'http://localhost:3002'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(trackApiUsage);
app.use(requestLog);

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Pantry Finder API is running' });
});

app.use('/auth', authRoutes);
app.use('/pantries', pantryRoutes);
app.use('/states', statesRouter);
app.use('/hearts', heartsRoutes);
app.use('/admin', adminRoutes);

const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// systemd sends SIGTERM on restart; drain connections and close Redis cleanly.
process.on('SIGTERM', () => {
  server.close(() => {
    void closeRedis().finally(() => process.exit(0));
  });
});
