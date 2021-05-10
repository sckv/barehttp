import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'http';
import type { Socket } from 'net';
import { Writable } from 'stream';
import { uuidv4, StatusCodes, StatusPhrases } from './utils/';
import { JSONStringify } from './utils/safe-json';

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

export class RequestFlow {
  request: WebRequest;
  response: WebResponse;
  uuid: string;
  params: { [k: string]: string | undefined } = {};
  private cache = true;
  private statusToSend: number = 200;

  constructor(public _originalRequest: IncomingMessage, public _originalResponse: ServerResponse) {
    this.request = pickFrom(_originalRequest, ...requestKeys);
    this.response = pickFrom(_originalResponse, ...responseKeys);
    this.uuid = (_originalRequest.headers['x-request-id'] as string) || uuidv4();
    (_originalRequest as any).id = this.uuid;
    this.setHeader('Content-Type', 'text/plain');
    this.setHeader('X-Request-Id', this.uuid);
  }

  disableCache() {
    this.cache = false;
  }

  setParams(params: { [k: string]: string | undefined }) {
    this.params = params;
  }

  setHeader(header: string, value: string | number) {
    this._originalResponse.setHeader(header, value);
    return this;
  }

  setHeaders(headers: { [header: string]: string | number }) {
    Object.entries(headers).forEach(([header, value]) => {
      this._originalResponse.setHeader(header, value);
    });
    return this;
  }

  status(status: typeof StatusCodes[keyof typeof StatusCodes]) {
    this.statusToSend = status;
    return this;
  }

  sendStatus(status: typeof StatusCodes[keyof typeof StatusCodes]) {
    this.status(status);
    this.send();
  }

  stream<T extends NodeJS.WritableStream>(stream: T) {
    this._originalResponse.pipe(stream, { end: true });
  }

  json(data: any) {
    // to generate for fast-json-stringify schema
    const jsoned = JSONStringify(data);
    this.setHeader('Content-Type', 'application/json');
    this.send(jsoned);
  }

  send(chunk?: string | ArrayBuffer | NodeJS.ArrayBufferView | SharedArrayBuffer) {
    if (this._originalResponse.socket?.destroyed) return;
    this._originalResponse.statusMessage = statusTuples[this.statusToSend];

    // work basic headers
    if (typeof chunk !== 'undefined' && chunk !== null)
      this.setHeader('Content-Length', Buffer.byteLength(chunk, 'utf-8'));
    if (!this.cache) this.setHeaders({ Cache: 'no-store', Expire: 0, Pragma: 'no-cache' });

    // perform sending
    this._originalResponse.writeHead(this.statusToSend);
    this._originalResponse.end(chunk);
  }
}
