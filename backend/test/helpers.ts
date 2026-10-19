import { Controller, Get, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Roles } from '../src/common/auth/decorators.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

export const PASSWORD = 'Password123!';

@Controller('test-probe')
export class RoleProbeController {
  @Get('authenticated')
  authenticated() {
    return { ok: true };
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Roles(Role.SELLER, Role.ADMIN)
  @Get('seller')
  seller() {
    return { ok: true };
  }
}

export async function createTestApp(controllers: Type[] = []) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export const uniqueEmail = (prefix = 'user') => `${prefix}-${randomUUID()}@e2e.test`;

export async function registerUser(app: INestApplication, email = uniqueEmail()) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, name: 'E2E User' })
    .expect(201);
  return { email, body: res.body, cookies: res.get('Set-Cookie') ?? [] };
}

export async function loginAs(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}
