import dotenv from 'dotenv';

/**
 * Loads environment variables from the appropriate .env file based on NODE_ENV.
 * This should be imported at the very top of the application entry point.
 */
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: '.env.production' });
} else {
  dotenv.config({ path: '.env' });
}
