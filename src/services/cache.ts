import { createClient, RedisClientType } from 'redis';
import logger from './logger';

class CacheService {
  private client: RedisClientType | null = null;
  private inited: boolean = false;

  async init(): Promise<void> {
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    logger.info('Connecting to Redis', { url });

    this.client = createClient({ url });

    this.client
      .on('error', (err: Error) => {
        logger.error('Redis Client Error', { err });
        this.inited = false;
      })
      .on('ready', () => {
        logger.info('Redis Client Ready');
        this.inited = true;
      })
      .on('end', () => {
        logger.info('Redis Client End');
        this.inited = false;
      })
      .on('reconnecting', () => {
        logger.info('Redis Client Reconnecting');
        this.inited = false;
      });

    await this.client.connect();
  }

  async size(set: string): Promise<number> {
    if (!this.inited || !this.client) {
      return 0;
    }
    return await this.client.hLen(set);
  }

  async forEachEntry<T>(
    set: string,
    cb: (field: string, value: T) => void
  ): Promise<void> {
    if (!this.inited || !this.client) {
      return;
    }

    let cursor = 0;
    do {
      const { cursor: nextCursor, tuples } = await this.client.hScan(set, cursor);
      cursor = nextCursor;
      for (const { field, value } of tuples) {
        cb(field, JSON.parse(value));
      }
    } while (cursor !== 0);
  }
}

export default CacheService;
