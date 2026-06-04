import { useEffect, useState } from 'react';
import type { UpdateStatus } from '@greenroom/shared';
import { api } from './api';

const INITIAL_STATUS: UpdateStatus = {
  phase: 'idle',
  currentVersion: '',
  supported: false,
};

export function useUpdater(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>(INITIAL_STATUS);

  useEffect(() => {
    void api.updaterGetStatus().then(setStatus);
    return api.onUpdaterStatus(setStatus);
  }, []);

  return status;
}
