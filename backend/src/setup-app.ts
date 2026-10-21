import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { CORRELATION_HEADER } from './common/correlation.js';
import type { Env } from './infra/config/env.schema.js';
import { RedisIoAdapter } from './infra/realtime/redis-io.adapter.js';

export function setupApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) {
    (app.getHttpAdapter().getInstance() as Application).set('trust proxy', trustProxy);
  }
  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready', 'metrics'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }).split(','),
    credentials: true,
    exposedHeaders: [CORRELATION_HEADER],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const ioAdapter = new RedisIoAdapter(
    app,
    config.get('REDIS_URL', { infer: true }),
    config.get('CORS_ORIGIN', { infer: true }).split(','),
  );
  ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Multi-Vendor Marketplace API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swaggerConfig), {
    jsonDocumentUrl: 'api/docs-json',
  });

  return config;
}
