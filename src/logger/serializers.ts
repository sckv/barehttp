import callsites from 'callsites';

import pJson from '../../package.json';

import util from 'util';
import type { IncomingMessage, ServerResponse } from 'http';

export function parseError(e: any, location: string, attrs: any) {
  const toSend = { error: { ...e }, location, ...attrs };
  toSend.message = e.message;
  if (e.stack) toSend.error.stack = e.stack;
  toSend.error.kind = e.constructor.name;
  return toSend;
}

const makeLoggerMetadata = (method: string | null) => ({
  name: 'pino',
  version: pJson.version,
  method_name: method,
});

export function serializeLog(...args) {
  const site = callsites()[2];
  const location = `${site.getFileName()}:${site.getLineNumber()}:${site.getColumnNumber()}`;
  const logger = makeLoggerMetadata(site.getFunctionName());

  if (!args.length) return { message: 'empty log', location, logger };
  if (args.length === 1) {
    if (typeof args[0] === 'string') return { message: args[0], location, logger };
    if (util.types.isNativeError(args[0])) return parseError(args[0], location, { logger });
    return { ...args[0], location, logger };
  }

  if (typeof args[0] === 'string') return { message: args.shift(), args, location, logger };
  return { ...args, location, logger };
}

function apacheLogFormat(
  startDate: Date,
  remoteClient: string,
  content: number,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const isProxy = req.headers['x-forwarded-for'];
  return `${isProxy || req.socket.remoteAddress} ${
    remoteClient || '-'
  } ${startDate.toISOString()} "${req.method} ${req.url} HTTP/${req.httpVersionMajor}.${
    req.httpVersionMinor
  }" ${res.statusCode} ${content || '-'}`;
}

export function getStatusLevel(statusCode: number) {
  if (statusCode >= 400 && statusCode < 500) {
    return 'warn';
  } else if (statusCode >= 500) {
    return 'error';
  }
  return 'info';
}

export function serializeHttp(
  headers: { [k: string]: any },
  startDate: Date,
  remoteClient: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  return {
    level: getStatusLevel(res.statusCode),
    logObject: {
      message: apacheLogFormat(startDate, remoteClient, headers['Content-Length'], req, res),
      request: {
        headers: req.headers,
        http_version: req.httpVersion,
        id: req.headers['x-request-id'] || 'unknown',
        method: req.method,
        url: req.url,
      },
      response: {
        status_code: res.statusCode,
        headers: headers,
      },
      duration: headers['X-Processing-Time'],
    },
  };
}
