import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Gauge } from 'prom-client';
import type { Socket } from 'socket.io';
import type { AccessTokenPayload } from '../../common/auth/auth.types.js';
import type { Env } from '../../infra/config/env.schema.js';
import { METRIC } from '../../infra/metrics/metric-names.js';
import { AccessTokenRevocationService } from '../auth/access-token-revocation.service.js';
import { extractBearerToken } from '../auth/guards/jwt-auth.guard.js';
import { RealtimeSnapshotsService } from './realtime-snapshots.service.js';
import {
  type Channel,
  CHANNELS,
  REALTIME_NAMESPACE,
  room,
  SERVER_EVENTS,
  type SubscribeAck,
} from './realtime.types.js';

interface SocketData {
  userId?: string;
  sessionCheck?: NodeJS.Timeout;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSubscription(body: unknown): { channel: Channel; id: string } | string {
  const { channel, id } = (body ?? {}) as { channel?: unknown; id?: unknown };
  if (typeof channel !== 'string' || !(CHANNELS as readonly string[]).includes(channel)) {
    return `channel must be one of: ${CHANNELS.join(', ')}`;
  }
  if (typeof id !== 'string' || !UUID.test(id)) {
    return 'id must be a UUID';
  }
  return { channel: channel as Channel, id };
}

@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly recheckMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly revocation: AccessTokenRevocationService,
    private readonly snapshots: RealtimeSnapshotsService,
    @InjectMetric(METRIC.wsConnections) private readonly connections: Gauge<string>,
  ) {
    this.recheckMs = config.get('REALTIME_AUTH_RECHECK_MS', { infer: true });
  }

  async handleConnection(client: Socket) {
    this.connections.inc();
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    const token =
      typeof auth?.token === 'string'
        ? auth.token
        : extractBearerToken(client.handshake.headers.authorization);

    if (!token) {
      client.emit(SERVER_EVENTS.ready, { userId: null });
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      if (await this.revocation.isRevoked(payload)) {
        throw new Error('revoked');
      }
      const data = client.data as SocketData;
      data.userId = payload.sub;
      data.sessionCheck = setInterval(() => void this.recheck(client, payload), this.recheckMs);
      data.sessionCheck.unref();
      await client.join(room.user(payload.sub));
      client.emit(SERVER_EVENTS.ready, { userId: payload.sub });
    } catch {
      client.emit('exception', { statusCode: 401, message: 'Invalid or expired access token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    clearInterval((client.data as SocketData).sessionCheck);
    this.connections.dec();
  }

  private async recheck(client: Socket, payload: AccessTokenPayload) {
    const expired = payload.exp !== undefined && payload.exp * 1000 <= Date.now();
    if (!expired && !(await this.revocation.isRevoked(payload))) {
      return;
    }
    client.emit('exception', {
      statusCode: 401,
      message: expired
        ? 'Access token expired, reconnect with a fresh one'
        : 'Session was revoked, sign in again',
    });
    client.disconnect(true);
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<SubscribeAck> {
    const parsed = parseSubscription(body);
    if (typeof parsed === 'string') {
      return { ok: false, error: parsed };
    }

    const channelRoom = room[parsed.channel](parsed.id);
    await client.join(channelRoom);
    const snapshot =
      parsed.channel === 'product'
        ? await this.snapshots.product(parsed.id, true)
        : await this.snapshots.auction(parsed.id, true);
    if (!snapshot) {
      await client.leave(channelRoom);
      return { ok: false, error: `${parsed.channel} not found` };
    }

    return { ok: true, channel: parsed.channel, snapshot };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const parsed = parseSubscription(body);
    if (typeof parsed === 'string') {
      return { ok: false, error: parsed };
    }
    await client.leave(room[parsed.channel](parsed.id));
    return { ok: true };
  }
}
