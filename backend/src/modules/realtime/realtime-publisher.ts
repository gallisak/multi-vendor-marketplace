import { Logger } from '@nestjs/common';

export interface Publisher {
  publish(channel: string, message: string | Buffer): Promise<number>;
}

const logger = new Logger('RealtimePublisher');

export function tolerantPublisher(redis: Publisher): Publisher {
  return {
    publish: (channel, message) =>
      redis.publish(channel, message).catch((error: unknown) => {
        logger.warn(
          { err: error, channel },
          'Realtime message dropped, clients resync on reconnect',
        );
        return 0;
      }),
  };
}
