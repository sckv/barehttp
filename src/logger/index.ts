import pino, { destination } from 'pino';

import { serializeLog, serializeHttp } from './serializers';

import { envs } from '../env';

const asyncDest = envs.isProd ? [destination({ sync: false })] : [];

const pinoCommonOptions = {
  timestamp: () => `,"time":"${new Date()[envs.isProd ? 'toISOString' : 'toLocaleTimeString']()}"`,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  messageKey: 'message',
  transport: envs.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
};

const logger = pino(pinoCommonOptions, asyncDest[0]);

interface LogMeFn {
  (obj: unknown, ...args: []): void;
  (msg: string, ...args: any[]): void;
}

type LogMe = {
  info: LogMeFn;
  warn: LogMeFn;
  error: LogMeFn;
  fatal: LogMeFn;
  debug: LogMeFn;
  trace: LogMeFn;
};

export const logHttp = (...params: Parameters<typeof serializeHttp>) => {
  const { level, logObject } = serializeHttp(...params);
  logger[level](logObject);
};

// TODO: remove the test condition
export const logMe: LogMe = {
  debug: (...args) => !envs.isTest && logger.debug(serializeLog(...args)),
  info: (...args) => !envs.isTest && logger.info(serializeLog(...args)),
  warn: (...args) => !envs.isTest && logger.warn(serializeLog(...args)),
  error: (...args) => !envs.isTest && logger.error(serializeLog(...args)),
  fatal: (...args) => !envs.isTest && logger.fatal(serializeLog(...args)),
  trace: (...args) => !envs.isTest && logger.trace(serializeLog(...args)),
};
