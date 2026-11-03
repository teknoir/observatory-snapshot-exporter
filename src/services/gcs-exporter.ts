import { Storage } from '@google-cloud/storage';
import logger from './logger';
import { ImageBatchItem } from '../utils/types';
import { errorInfo } from '../utils/utils';

export interface BucketLike {
  file(name: string): {
    save(data: Buffer, options: { contentType?: string; resumable?: boolean }): Promise<unknown>;
  };
}

export interface GCSExporterOptions {
  concurrency?: number;
  bucket?: BucketLike;
}

export interface BatchUploadResult {
  uploaded: number;
  failed: number;
}

const DEFAULT_CONCURRENCY = 4;

class GCSExporter {
  private bucket: BucketLike;
  private concurrency: number;

  constructor(projectId: string, bucketName: string, options: GCSExporterOptions = {}) {
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.bucket = options.bucket ?? new Storage({ projectId }).bucket(bucketName);
  }

  /**
   * Upload images to GCS with a bounded number of concurrent saves. Waits for
   * every upload to settle and never rejects.
   * @param images - Array of objects containing fileName and buffer.
   */
  async batchUploadImages(images: ImageBatchItem[]): Promise<BatchUploadResult> {
    const items = images.filter(image => !!image.buffer);

    let uploaded = 0;
    let failed = 0;
    let firstError: unknown = null;
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;

        try {
          await this.bucket.file(item.fileName).save(item.buffer, {
            contentType: 'image/jpeg',
            resumable: false, // Recommended for small files.
          });
          uploaded += 1;
          logger.debug(`Image uploaded successfully: ${item.fileName}`);
        } catch (error) {
          failed += 1;
          if (firstError === null) {
            firstError = error;
          }
        }
      }
    };

    const workers: Promise<void>[] = [];
    const workerCount = Math.min(this.concurrency, items.length);
    for (let i = 0; i < workerCount; i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (failed > 0) {
      logger.error(`Failed to upload ${failed} of ${items.length} images to GCS`, {
        uploaded,
        failed,
        error: errorInfo(firstError),
      });
    }

    return { uploaded, failed };
  }
}

export default GCSExporter;
