import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import logger from './logger';
import { ImageBatchItem } from '../utils/types';

class GCSExporter {
  private storage: Storage;
  private bucketName: string;

  constructor(projectId: string, bucketName: string) {
    this.storage = new Storage({ projectId });
    this.bucketName = bucketName;
  }

  /**
   * Upload a single image to GCS.
   * @param fileName - Name of the file in GCS.
   * @param base64Image - Base64-encoded JPEG image string.
   */
  async uploadImage(fileName: string, base64Image: string): Promise<void> {
    try {
      const buffer = Buffer.from(base64Image, 'base64');
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(fileName);

      await file.save(buffer, {
        contentType: 'image/jpeg',
        resumable: true,
      });

      logger.debug(`Image uploaded successfully: ${fileName}`);
    } catch (error) {
      logger.error('Error uploading image to GCS', { error });
      throw error;
    }
  }

  /**
   * Batch upload images to GCS using streams.
   * @param images - Array of objects containing fileName and base64Image.
   */
  async batchUploadImages(images: ImageBatchItem[]): Promise<void> {
    const maxBatchSize = 5000; // GCS rate limit: 5000 writes per second
    const bucket = this.storage.bucket(this.bucketName);

    for (let i = 0; i < images.length; i += maxBatchSize) {
      const batch = images.slice(i, i + maxBatchSize).filter(image => !!image.buffer); // Filter out empty images

      const stream = new Readable({
        objectMode: true,
        read() {
          batch.forEach(image => this.push(image));
          this.push(null); // Signal end of stream
        },
      });

      await new Promise<void>((resolve, reject) => {
        stream
          .on('data', async (image: ImageBatchItem) => {
            // const buffer = Buffer.from(image.base64Image, 'base64');
            const buffer = image.buffer; // Use the buffer directly if provided
            const file = bucket.file(image.fileName);

            try {
              await file.save(buffer, {
                contentType: 'image/jpeg',
                resumable: true,
              });
              logger.debug(`Image uploaded successfully: ${image.fileName}`);
            } catch (error) {
              logger.error('Error uploading image in batch', { error });
              reject(error);
            }
          })
          .on('end', () => {
            logger.debug('Batch upload completed');
            resolve();
          })
          .on('error', error => {
            logger.error('Error in batch upload stream', { error });
            reject(error);
          });
      });
    }
  }
}

export default GCSExporter;
