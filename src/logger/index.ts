import pino, {
  destination,
  type LevelWithSilent,
  type Logger as PinoLogger,
  type LoggerOptions as PinoLoggerOptions,
} from 'pino';

import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { serializeLog, serializeHttp } from './serializers.js';
import { envs } from '../env.js';

type LoggerFileConfig = {
  path: string;
  sync?: boolean;
};

type LoggerTargetConfig = {
  file?: string | LoggerFileConfig;
  level?: LevelWithSilent;
};

export type LoggerConfig = {
  console?: boolean;
  pretty?: boolean;
  level?: LevelWithSilent;
  app?: LoggerTargetConfig;
  http?: LoggerTargetConfig;
  sourceMaps?: boolean;
};

const defaultPretty = !envs.isProd;
const defaultFileSync = envs.isProd ? false : true;

const pinoCommonOptions: PinoLoggerOptions = {
  timestamp: () => `,"time":"${new Date()[envs.isProd ? 'toISOString' : 'toLocaleTimeString']()}"`,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  messageKey: 'message',
};

type LoggerLike = Record<LevelWithSilent, (...args: any[]) => void>;

const noop = () => {};
const noopLogger: LoggerLike = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  silent: noop,
};

let sourceMapsRegistered = false;

const enableSourceMaps = (enabled?: boolean) => {
  if (!enabled || sourceMapsRegistered) return;
  sourceMapsRegistered = true;
  void import('source-map-support/register').catch(() => {
    sourceMapsRegistered = false;
  });
};

const normalizeFileConfig = (file?: string | LoggerFileConfig) => {
  if (!file) return undefined;
  if (typeof file === 'string') return { path: file, sync: defaultFileSync };
  return { path: file.path, sync: file.sync ?? defaultFileSync };
};

const ensureLogDir = (filePath: string) => {
  const dir = dirname(filePath);
  if (dir && dir !== '.') {
    mkdirSync(dir, { recursive: true });
  }
};

const toLoggerLike = (logger: PinoLogger): LoggerLike => {
  const call =
    (method: keyof LoggerLike) =>
    (...args: any[]) =>
      (logger as any)[method](...args);

  return {
    trace: call('trace'),
    debug: call('debug'),
    info: call('info'),
    warn: call('warn'),
    error: call('error'),
    fatal: call('fatal'),
    silent: noop,
  };
};

const buildConsoleLogger = (options: PinoLoggerOptions, prettyEnabled: boolean) => {
  if (prettyEnabled) {
    try {
      const transport = pino.transport({
        targets: [{ target: 'pino-pretty', options: { colorize: true } }],
      });
      return toLoggerLike(pino(options, transport));
    } catch {
      return toLoggerLike(pino(options, destination({ dest: 1, sync: false })));
    }
  }
  return toLoggerLike(pino(options, destination({ dest: 1, sync: false })));
};

const buildFileLogger = (options: PinoLoggerOptions, fileConfig: LoggerFileConfig) => {
  ensureLogDir(fileConfig.path);
  return toLoggerLike(
    pino(options, destination({ dest: fileConfig.path, sync: fileConfig.sync ?? defaultFileSync })),
  );
};

const combineLoggers = (primary?: LoggerLike, secondary?: LoggerLike): LoggerLike => {
  if (!primary && !secondary) return noopLogger;
  const first = primary ?? noopLogger;
  const second = secondary ?? noopLogger;
  return {
    trace: (...args) => {
      first.trace(...args);
      second.trace(...args);
    },
    debug: (...args) => {
      first.debug(...args);
      second.debug(...args);
    },
    info: (...args) => {
      first.info(...args);
      second.info(...args);
    },
    warn: (...args) => {
      first.warn(...args);
      second.warn(...args);
    },
    error: (...args) => {
      first.error(...args);
      second.error(...args);
    },
    fatal: (...args) => {
      first.fatal(...args);
      second.fatal(...args);
    },
    silent: noop,
  };
};

const buildLogger = (config: LoggerConfig, target?: LoggerTargetConfig): LoggerLike => {
  const consoleEnabled = config.console ?? true;
  const prettyEnabled = config.pretty ?? defaultPretty;
  const fileConfig = normalizeFileConfig(target?.file);
  const level = target?.level ?? config.level;

  const options: PinoLoggerOptions = { ...pinoCommonOptions };
  if (level) options.level = level;

  const consoleLogger = consoleEnabled ? buildConsoleLogger(options, prettyEnabled) : undefined;
  const fileLogger = fileConfig ? buildFileLogger(options, fileConfig) : undefined;

  return combineLoggers(consoleLogger, fileLogger);
};

let appLogger: LoggerLike;
let httpLogger: LoggerLike;

export const configureLogger = (config: LoggerConfig = {}) => {
  enableSourceMaps(config.sourceMaps);

  if (config.app || config.http) {
    appLogger = buildLogger(config, config.app);
    httpLogger = buildLogger(config, config.http);
  } else {
    const shared = buildLogger(config);
    appLogger = shared;
    httpLogger = shared;
  }
};

configureLogger();

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
  httpLogger[level](logObject);
};

// TODO: remove the test condition
export const logMe: LogMe = {
  debug: (...args) => !envs.isTest && appLogger.debug(serializeLog(...args)),
  info: (...args) => !envs.isTest && appLogger.info(serializeLog(...args)),
  warn: (...args) => !envs.isTest && appLogger.warn(serializeLog(...args)),
  error: (...args) => !envs.isTest && appLogger.error(serializeLog(...args)),
  fatal: (...args) => !envs.isTest && appLogger.fatal(serializeLog(...args)),
  trace: (...args) => !envs.isTest && appLogger.trace(serializeLog(...args)),
};
