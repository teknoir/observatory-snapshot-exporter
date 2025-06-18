import logger from './logger';

class Scheduler {
  private interval: number;
  private task: () => Promise<void>;
  private isRunning: boolean = false;
  private timerId: NodeJS.Timeout | null = null;

  constructor(interval: number, task: () => Promise<void>) {
    this.interval = interval;
    this.task = task;
  }

  /**
   * Start the scheduler.
   */
  start(): void {
    if (this.timerId) {
      logger.warn('Scheduler is already running.');
      return;
    }

    this.timerId = setInterval(async () => {
      if (this.isRunning) {
        logger.warn('Previous task is still running. Skipping this interval.');
        return;
      }

      this.isRunning = true;
      try {
        await this.task();
      } catch (error) {
        logger.error('Error occurred while running the scheduled task', { error });
      } finally {
        this.isRunning = false;
      }
    }, this.interval);

    logger.info(`Scheduler started with interval: ${this.interval}ms`);
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      logger.info('Scheduler stopped.');
    } else {
      logger.warn('Scheduler is not running.');
    }
  }
}

export default Scheduler;
