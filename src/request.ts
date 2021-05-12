import hyperid from 'hyperid';

import { StatusCodes, StatusPhrases } from './utils/';
import { JSONStringify } from './utils/safe-json';
import { httpLogger } from './logger';

import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'http';
import type { Socket } from 'net';
import { Writable } from 'stream';
const generateId = hyperid();

type WebRequest = {
  headers: IncomingHttpHeaders;
  rawHeaders: string[];
  aborted: boolean;
  complete: boolean;
  destroyed: boolean;
  destroy(error?: Error | undefined): void;
  pipe<T extends NodeJS.WritableStream>(
    destination: T,
    options?:
      | {
          end?: boolean | undefined;
        }
      | undefined,
  ): T;
  on: IncomingMessage['on'];
};

type WebResponse = {
  socket: Socket | null;
  statusCode: number;
  headersSent: boolean;
  chunkedEncoding: boolean;
  destroyed: boolean;
  pipe<T extends NodeJS.WritableStream>(
    destination: T,
    options?:
      | {
          end?: boolean | undefined;
        }
      | undefined,
  ): T;
  shouldKeepAlive: boolean;
  on: ServerResponse['on'];
  end: Writable['end'];
  writeHead(
    statusCode: number,
    reasonPhrase?: string | undefined,
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined,
  ): void;
  addTrailers(headers: OutgoingHttpHeaders | readonly [string, string][]): void;
};

const requestKeys = [
  'headers',
  'rawHeaders',
  'aborted',
  'complete',
  'destroyed',
  'destroy',
  'pipe',
  'on',
] as const;
const responseKeys = [
  'socket',
  'statusCode',
  'headersSent',
  'chunkedEncoding',
  'destroyed',
  'pipe',
  'shouldKeepAlive',
  'on',
  'end',
  'writeHead',
  'addTrailers',
] as const;

const pickFrom = <O, T extends Array<keyof O>>(obj: O, ...args: T) => {
  return args.reduce((acc, curr) => {
    acc[curr] = obj[curr];
    return acc;
  }, {} as { [K in keyof O]: O[K] });
};

type Codes<K extends keyof typeof StatusCodes = keyof typeof StatusCodes> = {
  [L in typeof StatusCodes[K]]: typeof StatusPhrases[K];
};

const statusTuples = Object.entries(StatusCodes).reduce((acc, [name, status]) => {
  acc[status] = StatusPhrases[name];
  return acc;
}, {} as Codes);

type FlowOpts = {
  /**
   * Default 's' - seconds
   */
  requestTimeFormat?: 's' | 'ms';
};

export class RequestFlow {
  uuid: string;
  params: { [k: string]: string | undefined } = {};
  private cache = true;
  private statusToSend = 200;
  private startTime: [seconds: number, nanoseconds: number];
  private countTimeFormat: 'ms' | 's' = 's';
  private headers: { [header: string]: string | number } = {};

  constructor(public _originalRequest: IncomingMessage, public _originalResponse: ServerResponse) {
    this.uuid = (_originalRequest.headers['x-request-id'] as string) || generateId();
    (_originalRequest as any).id = this.uuid;
    this.setHeaders({ 'Content-Type': 'text/plain', 'X-Request-Id': this.uuid });
    this.startTime = process.hrtime();

    // _originalResponse.on('close', () => setImmediate(() => httpLogger.info(this.headers)));
  }

  private setRequestTime() {
    const diff = process.hrtime(this.startTime);

    const time =
      diff[0] * (this.countTimeFormat === 's' ? 1 : 1e3) +
      diff[1] * (this.countTimeFormat === 's' ? 1e-9 : 1e-6);

    this.setHeaders({
      'X-Response-Time': time,
      'X-Response-Time-Mode': this.countTimeFormat === 's' ? 'seconds' : 'milliseconds',
    });
  }

  setTimeFormat(format: 's' | 'ms') {
    this.countTimeFormat = format;
  }

  disableCache() {
    this.cache = false;
  }

  setParams(params: { [k: string]: string | undefined }) {
    this.params = params;
  }

  setHeader(header: string, value: string | number) {
    this.headers[header] = value;
  }

  setHeaders(headers: { [header: string]: string | number }) {
    for (const header of Object.keys(headers)) {
      this.headers[header] = headers[header];
    }
  }

  status(status: typeof StatusCodes[keyof typeof StatusCodes]) {
    this.statusToSend = status;
  }

  sendStatus(status: typeof StatusCodes[keyof typeof StatusCodes]) {
    this.status(status);
    this.send();
  }

  stream<T extends NodeJS.WritableStream>(stream: T) {
    this._originalResponse.pipe(stream, { end: true });
  }

  json(data: any) {
    // to generate with fast-json-stringify schema issue #1
    const jsoned = JSONStringify(data);
    this.setHeader('Content-Type', 'application/json');
    this.send(jsoned);
  }

  send(chunk?: string | ArrayBuffer | NodeJS.ArrayBufferView | SharedArrayBuffer) {
    if (this._originalResponse.socket?.destroyed) return;

    // work basic headers
    if (typeof chunk !== 'undefined' && chunk !== null)
      this.setHeader('Content-Length', Buffer.byteLength(chunk, 'utf-8'));

    if (!this.cache) this.setHeaders({ Cache: 'no-store', Expire: 0, Pragma: 'no-cache' });

    this.setRequestTime();

    // perform sending
    this._originalResponse.writeHead(
      this.statusToSend,
      statusTuples[this.statusToSend],
      this.headers,
    );
    this._originalResponse.end(chunk);
  }
}
