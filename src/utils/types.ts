export interface InferenceEvent {
  metadata: {
    timestamp: string;
    id: string;
    namespace: string;
  },
  data: {
    image?: string;
    peripheral?: {
      id: string;
    };
  },
  device: string;
}

export type ImageBatchItem = {
  fileName: string;
  // base64Image: string;
  buffer: Buffer;
};
