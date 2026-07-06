import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://78f0550aafa3a2e7d905c25c0e778bcd@o4511544212324352.ingest.us.sentry.io/4511544216125440',
  tracesSampleRate: 1.0,
  debug: false,
});
