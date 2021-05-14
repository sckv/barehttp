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
  prettyPrint: !envs.isProd,
};

const logger = pino(pinoCommonOptions, asyncDest[0]);

if (envs.isProd) {
  setInterval(function () {
    logger.flush();
  }, 10000).unref();

  const handler = pino.final(logger, (err, finalLogger, evt) => {
    finalLogger.info(`${evt} caught`);
    if (err) finalLogger.error(err, 'error caused exit');
    process.exit(err ? 1 : 0);
  });

  // catch all the ways node might exit
  process.on('beforeExit', () => handler(null, 'beforeExit'));
  process.on('exit', () => handler(null, 'exit'));
  process.on('uncaughtException', (err) => handler(err, 'uncaughtException'));
  process.on('SIGINT', () => handler(null, 'SIGINT'));
  process.on('SIGQUIT', () => handler(null, 'SIGQUIT'));
  process.on('SIGTERM', () => handler(null, 'SIGTERM'));
}

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

export const logMe: LogMe = {
  debug: (...args) => logger.debug(serializeLog(...args)),
  info: (...args) => logger.info(serializeLog(...args)),
  warn: (...args) => logger.warn(serializeLog(...args)),
  error: (...args) => logger.error(serializeLog(...args)),
  fatal: (...args) => logger.fatal(serializeLog(...args)),
  trace: (...args) => logger.trace(serializeLog(...args)),
};
