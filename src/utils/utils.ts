// Turn an unknown thrown value into the plain fields a logger can serialise.
export const errorInfo = (
  error: unknown
): { message: string; name?: string; code?: string | number } => {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; name?: unknown; code?: unknown };
    const info: { message: string; name?: string; code?: string | number } = {
      message: typeof candidate.message === 'string' ? candidate.message : String(error),
    };

    if (typeof candidate.name === 'string') {
      info.name = candidate.name;
    }
    if (typeof candidate.code === 'string' || typeof candidate.code === 'number') {
      info.code = candidate.code;
    }

    return info;
  }

  return { message: String(error) };
};

// Generate a unique ID
export const getUniqueID = (): string => {
  const s4 = (): string => {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  };
  return `${s4()}${s4()}-${s4()}`;
};

// Timer utility to delay execution
export const timer = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Compose a peripheral key from data
export interface PeripheralData {
  device?: string;
  data?: {
    peripheral?: {
      id?: string;
    };
  };
  peripheralId?: string;
}

export const composePeripheralKey = (data: PeripheralData): string => {
  const device = data?.device ?? '';
  const peripheralId = data?.data?.peripheral?.id || (data?.peripheralId ?? '');
  return JSON.stringify({ device, peripheralId });
};

// Decompose a peripheral key into its components
export interface DecomposedKey {
  device: string;
  peripheralId: string;
}

export const decomposePeripheralKey = (key: string): DecomposedKey => {
  try {
    const { device, peripheralId } = JSON.parse(key);
    return { device, peripheralId };
  } catch (e) {
    console.error('decomposePeripheralKey error', e);
    return { device: '', peripheralId: '' };
  }
};
