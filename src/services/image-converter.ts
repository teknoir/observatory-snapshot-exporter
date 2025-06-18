import logger from './logger';
import { ImageBatchItem } from '../utils/types';
import { ImageConverterWorker } from './image-converter-worker-events';


// Main thread logic
class ImageConverter {
  async convert(imageBatchItem: ImageBatchItem): Promise<ImageBatchItem> {
    return new Promise((resolve, reject) => {
      const worker = new ImageConverterWorker(imageBatchItem);

      worker.on('message', (result: ImageBatchItem | { error: any }) => {
        if ('error' in result) {
          reject(result.error);
        } else {
          resolve(result);
        }
      });

      worker.on('error', error => {
        logger.error('Worker error', { error });
        reject(error);
      });

      worker.on('exit', code => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }
}

export default ImageConverter;
