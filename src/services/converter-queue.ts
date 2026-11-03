import { ImageBatchItem } from '../utils/types';
import { errorInfo } from '../utils/utils';
import ImageConverter from './image-converter';
import logger from './logger';

export interface ImageConverterLike {
  convert(item: ImageBatchItem): Promise<ImageBatchItem>;
}

export interface ConverterQueueOptions {
  maxInFlight?: number;
  converter?: ImageConverterLike;
}

export interface ConverterQueueStats {
  inFlight: number;
  resolved: number;
  dropped: number;
  timerRunning: boolean;
}

const DEFAULT_MAX_IN_FLIGHT = 50;

/**
 * Converts images to low quality and hands them to a callback in batches.
 *
 * Nothing is retained: an item lives only in the in-flight set until its
 * conversion settles, then in the resolved list until the next flush. Items
 * beyond maxInFlight are dropped instead of queued.
 */
class ConverterQueue {
  private resolvedItems: ImageBatchItem[] = [];
  private inFlight = new Set<Promise<void>>();
  private flushing = new Set<Promise<void>>();
  private batchSize: number;
  private interval: number;
  private callback: (batch: ImageBatchItem[]) => Promise<void>;
  private timerId: NodeJS.Timeout | null = null;
  private tickRunning: boolean = false;
  private dropWarnedThisTick: boolean = false;
  private dropped: number = 0;
  private maxInFlight: number;
  private imageConverter: ImageConverterLike;

  constructor(
    batchSize: number,
    interval: number,
    callback: (batch: ImageBatchItem[]) => Promise<void>,
    options: ConverterQueueOptions = {}
  ) {
    this.batchSize = batchSize;
    this.interval = interval;
    this.callback = callback;
    this.maxInFlight = options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
    this.imageConverter = options.converter ?? new ImageConverter();
  }

  /**
   * Start converting an item.
   * @returns false when the item was dropped because the queue is full.
   */
  add(item: ImageBatchItem): boolean {
    if (this.inFlight.size >= this.maxInFlight) {
      this.dropped += 1;

      // One warning per timer tick, however many frames are dropped in it.
      if (!this.dropWarnedThisTick) {
        this.dropWarnedThisTick = true;
        logger.warn(`Converter queue is full (${this.maxInFlight} in flight), dropping frames`, {
          dropped: this.dropped,
        });
      }

      return false;
    }

    this.startTimer();

    const promise = this.imageConverter
      .convert(item)
      .then(resolvedItem => {
        this.resolvedItems.push(resolvedItem);

        // If the resolved batch size reaches the specified batch size, send the batch to the callback
        if (this.resolvedItems.length >= this.batchSize) {
          void this.flush();
        }
      })
      .catch(error => {
        logger.error('Error processing image in queue', { error: errorInfo(error) });
      })
      .finally(() => {
        this.inFlight.delete(promise);
      });

    this.inFlight.add(promise);

    return true;
  }

  /**
   * Flush the resolved items to the callback and clear them. The batch is
   * taken before the callback runs, so a second flush never sees it. The
   * running callback is tracked so drain() can wait for it.
   */
  private flush(): Promise<void> {
    if (this.resolvedItems.length === 0) {
      return Promise.resolve();
    }

    const batch = this.resolvedItems;
    this.resolvedItems = [];

    const promise: Promise<void> = Promise.resolve()
      .then(() => this.callback(batch))
      .catch(error => {
        // The batch is dropped: it is not retried.
        logger.error('Error executing callback for resolved batch', { error: errorInfo(error) });
      })
      .finally(() => {
        this.flushing.delete(promise);
      });

    this.flushing.add(promise);
    return promise;
  }

  /**
   * Start the timer that flushes resolved items.
   */
  private startTimer(): void {
    if (this.timerId) {
      return;
    }

    this.dropWarnedThisTick = false;
    this.timerId = setInterval(() => {
      void this.onTick();
    }, this.interval);

    logger.debug(`Converter queue timer started with interval: ${this.interval}ms`);
  }

  /**
   * One timer tick: flush what is resolved, stop the timer when idle. A tick
   * does not wait for in-flight conversions, and ticks do not overlap.
   */
  private async onTick(): Promise<void> {
    if (this.tickRunning) {
      return;
    }

    this.tickRunning = true;
    try {
      this.dropWarnedThisTick = false;
      await this.flush();

      if (this.inFlight.size === 0 && this.resolvedItems.length === 0 && this.flushing.size === 0) {
        this.stopTimer();
      }
    } finally {
      this.tickRunning = false;
    }
  }

  /**
   * Stop the timer.
   */
  private stopTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      logger.debug('Converter queue timer stopped.');
    }
  }

  stats(): ConverterQueueStats {
    return {
      inFlight: this.inFlight.size,
      resolved: this.resolvedItems.length,
      dropped: this.dropped,
      timerRunning: this.timerId !== null,
    };
  }

  /**
   * Wait for in-flight conversions and running callbacks, flush the rest and
   * stop the timer.
   */
  async drain(): Promise<void> {
    while (
      this.inFlight.size > 0 ||
      this.resolvedItems.length > 0 ||
      this.flushing.size > 0
    ) {
      await Promise.allSettled([...this.inFlight, ...this.flushing]);
      await this.flush();
    }

    this.stopTimer();
  }
}

export default ConverterQueue;
