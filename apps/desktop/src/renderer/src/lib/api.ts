import type { GreenroomIpcApi } from '@greenroom/shared';

/** The preload-exposed, context-isolated bridge to the main process. */
export const api: GreenroomIpcApi = window.greenroom;
