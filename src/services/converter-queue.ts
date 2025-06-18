import { ImageBatchItem } from '../utils/types';
import ImageConverter from './image-converter';
import logger from './logger';

class ConverterQueue {
  private queue: ImageBatchItem[] = [];
  private resolvedItems: ImageBatchItem[] = [];
  private pendingPromises: Promise<void>[] = [];
  private batchSize: number;
  private interval: number;
  private callback: (batch: ImageBatchItem[]) => Promise<void>;
  private timerId: NodeJS.Timeout | null = null;
  private imageConverter: ImageConverter;

  constructor(batchSize: number, interval: number, callback: (batch: ImageBatchItem[]) => Promise<void>) {
    this.batchSize = batchSize;
    this.interval = interval;
    this.callback = callback;
    this.imageConverter = new ImageConverter();
  }

  /**
   * Add a new item to the processing queue.
   * @param item - The ImageBatchItem to be processed.
   */
  add(item: ImageBatchItem): void {
    this.queue.push(item);

    const promise = this.imageConverter.convert(item)
      .then(resolvedItem => {
        this.resolvedItems.push(resolvedItem);

        // If the resolved batch size reaches the specified batch size, send the batch to the callback
        if (this.resolvedItems.length >= this.batchSize) {
          this.flushResolvedBatch();
        }
      })
      .catch(error => {
        logger.error('Error processing image in queue', { error });
      });

    this.pendingPromises.push(promise);

    // Start the timer if not already running
    if (!this.timerId) {
      this.startTimer();
    }
  }

  /**
   * Flush the resolved batch to the callback and clear the resolved items.
   */
  private async flushResolvedBatch(): Promise<void> {
    if (this.resolvedItems.length > 0) {
      try {
        await this.callback(this.resolvedItems);
        this.resolvedItems = [];
      } catch (error) {
        logger.error('Error executing callback for resolved batch', { error });
      }
    }
  }

  /**
   * Start the timer to periodically flush resolved items.
   */
  private startTimer(): void {
    this.timerId = setInterval(async () => {
      // Wait for all pending promises to resolve before flushing
      await Promise.allSettled(this.pendingPromises);
      await this.flushResolvedBatch();

      // Stop the timer if there are no pending promises and no items in the queue
      if (this.queue.length === 0 && this.pendingPromises.length === 0) {
        this.stopTimer();
      }
    }, this.interval);

    logger.info(`Converter queue timer started with interval: ${this.interval}ms`);
  }

  /**
   * Stop the timer.
   */
  private stopTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      logger.info('Converter queue timer stopped.');
    }
  }
}

export default ConverterQueue;
