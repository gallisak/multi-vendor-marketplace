import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

describe('App infrastructure (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is alive', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('GET /health/ready checks database and redis', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);

    expect(res.body.info.database.status).toBe('up');
    expect(res.body.info.redis.status).toBe('up');
  });

  it('propagates the incoming correlation id into error responses', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/does-not-exist')
      .set('x-correlation-id', 'e2e-correlation-1')
      .expect(404);

    expect(res.headers['x-correlation-id']).toBe('e2e-correlation-1');
    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'NOT_FOUND',
      correlationId: 'e2e-correlation-1',
      path: '/api/does-not-exist',
    });
  });

  it('generates a correlation id when the client sends none', async () => {
    const res = await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);

    expect(res.headers['x-correlation-id']).toMatch(/^[\w-]{8,}$/);
    expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
  });

  it('exposes Prometheus metrics outside the api prefix', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).toContain('http_request_duration_seconds');
  });

  it('serves the OpenAPI document without internal endpoints', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(res.body.info.title).toBe('Multi-Vendor Marketplace API');
    expect(Object.keys(res.body.paths)).not.toContain('/metrics');
  });
});
