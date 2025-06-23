const { isMainThread, parentPort, workerData } = require('worker_threads');
const sharp = require('sharp');


if (!isMainThread) {
  // Worker thread logic
  const { imageBatchItem } = workerData;

  const convertImage = async (item) => {
    try {
      const buffer = item.buffer; // Use the buffer directly if provided
      const lowQualityBuffer = await sharp(buffer)
        .resize(320, 180) // Resize to low resolution (e.g., 320x180)
        .jpeg({ quality: 50 }) // Reduce quality to 50%
        .toBuffer();

      return {
        fileName: item.fileName.replace('frames-hq', 'frames-lq'), // Update file path for low-quality image
        buffer: lowQualityBuffer, // Use the buffer directly
      };
    } catch (error) {
      throw error;
    }
  };

  convertImage(imageBatchItem)
    .then(result => {
      parentPort?.postMessage(result); // Send the converted image back to the main thread
    })
    .catch(error => {
      parentPort?.postMessage({ error });
    });
}
