/** Tests run against their own SQLite file so a test run never eats the seeded campus
 *  in server/dev.db. The file is created by `prisma migrate deploy` in globalSetup below. */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:../test.db';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
