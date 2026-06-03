import type { GreenroomIpcApi } from '@greenroom/shared';

declare global {
  interface Window {
    greenroom: GreenroomIpcApi;
  }
}

export {};
