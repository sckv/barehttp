import pino, { destination } from 'pino';

const asyncDest = destination({ sync: false });

export const logger = pino(asyncDest);
export const httpLogger = pino(asyncDest);
