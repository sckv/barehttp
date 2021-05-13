import pino, { destination } from 'pino';
import callsites from 'callsites';

import util from 'util';

const asyncDest = destination({ sync: false });

const logger = pino(asyncDest);
export const httpLogger = pino(asyncDest);

interface LogMeFn {
  (msg: string, ...args: any[]): void;
  (...args: []): void;
}

type LogMe = {
  info: LogMeFn;
  warn: LogMeFn;
  error: LogMeFn;
  fatal: LogMeFn;
  debug: LogMeFn;
  trace: LogMeFn;
};

const parseError = (e: any, location: string) => {
  const properties = { ...e, location };
  properties.message = e.message;
  if (e.stack) properties.stack = e.stack;
  return properties;
};

function mergeLogs(...args) {
  const site = callsites();
  const location = `${site[2].getFileName()}:${site[2].getLineNumber()}:${site[2].getColumnNumber()}`;
  if (!args.length) return { message: 'Empty log', location };
  if (args.length === 1) {
    if (typeof args[0] === 'string') return { message: args[0], location };
    if (util.types.isNativeError(args[0])) return parseError(args[0], location);
    return { ...args[0], location };
  }

  if (typeof args[0] === 'string') args[0] = { message: args[0], location };
  return { ...args[0], location };
}

export const logMe: LogMe = {
  debug: (...args) => logger.debug(mergeLogs(...args)),
  info: (...args) => logger.info(mergeLogs(...args)),
  warn: (...args) => logger.warn(mergeLogs(...args)),
  error: (...args) => logger.error(mergeLogs(...args)),
  fatal: (...args) => logger.fatal(mergeLogs(...args)),
  trace: (...args) => logger.trace(mergeLogs(...args)),
};
