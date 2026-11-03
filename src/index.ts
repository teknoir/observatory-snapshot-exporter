import 'dotenv/config';
import logger from './services/logger';
import CacheService from './services/cache';
import Scheduler from './services/scheduller';
import { ImageBatchItem } from './utils/types';
import GCSExporter from './services/gcs-exporter';
import ConverterQueue from './services/converter-queue';
import { FrameTracker } from './services/frame-tracker';
import { createExportTask } from './services/export-task';

// Read environment variables into constants
const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || 'teknoir';
const gcloudStorageBucket = process.env.GCLOUD_STORAGE_BUCKET || 'victra-poc.teknoir.cloud';
const schedulerInterval = parseInt(process.env.SCHEDULER_INTERVAL || '10000', 10);
const memoryLogInterval = parseInt(process.env.MEMORY_LOG_INTERVAL || '600000', 10);

logger.info(`Starting Snapshot Exporter`);
logger.info(`Google Cloud Project: ${googleCloudProject}`);
logger.info(`GCloud Storage Bucket: ${gcloudStorageBucket}`);

let scheduler: Scheduler | null = null;
let converterQueue: ConverterQueue | null = null;
let currentRun: Promise<void> | null = null;
let shuttingDown = false;

const toMB = (bytes: number): number => Math.round(bytes / 1024 / 1024);

const startMemoryLog = (queue: ConverterQueue, tracker: FrameTracker): void => {
  if (!Number.isFinite(memoryLogInterval) || memoryLogInterval <= 0) {
    return;
  }

  const timer = setInterval(() => {
    const usage = process.memoryUsage();

    logger.info('memory', {
      rssMB: toMB(usage.rss),
      heapUsedMB: toMB(usage.heapUsed),
      externalMB: toMB(usage.external),
      arrayBuffersMB: toMB(usage.arrayBuffers),
      queue: queue.stats(),
      trackedFrames: tracker.size(),
    });
  }, memoryLogInterval);

  timer.unref();
};

const main = async (): Promise<void> => {
  const cacheService = new CacheService();
  await cacheService.init();

  const gcsExporter = new GCSExporter(googleCloudProject, gcloudStorageBucket);
  const queue = new ConverterQueue(3000, 2000, async (batch: ImageBatchItem[]) => {
    logger.info(`Processing batch of Low Quality ${batch.length} images`);
    await gcsExporter.batchUploadImages(batch);
  });
  const tracker = new FrameTracker();

  converterQueue = queue;
  startMemoryLog(queue, tracker);

  const exportTask = createExportTask({
    cache: cacheService,
    exporter: gcsExporter,
    queue,
    tracker,
  });

  // Remember the run that is in progress, so shutdown() can wait for it.
  const trackedTask = async (): Promise<void> => {
    currentRun = exportTask();
    try {
      await currentRun;
    } finally {
      currentRun = null;
    }
  };

  scheduler = new Scheduler(schedulerInterval, trackedTask);
  scheduler.start();
};

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info(`${signal} signal received, shutting down.`);

  scheduler?.stop();

  if (converterQueue) {
    const queue = converterQueue;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(resolve, 10000);
      timer.unref();
    });

    await Promise.race([
      (async () => {
        if (currentRun) {
          await currentRun.catch(() => undefined);
        }
        await queue.drain();
      })(),
      timeout,
    ]);

    if (timer) {
      clearTimeout(timer);
    }
  }

  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

main();
