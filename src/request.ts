import hyperid from 'hyperid';

import { StatusCodes, StatusCodesUnion, StatusPhrases } from './utils/';
import { JSONParse, JSONStringify } from './utils/safe-json';
import { logHttp, logMe } from './logger';
import { ContentType } from './utils/content-type';
import { CookiesManager, CookiesManagerOptions } from './middlewares/cookies/cookie-manager';

import { types } from 'util';
import { Writable } from 'stream';
import url from 'url';

import type { IncomingMessage, ServerResponse } from 'http';
const generateId = hyperid();

type Codes<K extends keyof typeof StatusCodes = keyof typeof StatusCodes> = {
  [L in typeof StatusCodes[K]]: typeof StatusPhrases[K];
};

type Cacheability = 'public' | 'private' | 'no-cache' | 'no-store';
type ExpirationType =
  | 'max-age'
  | 's-maxage'
  | 'max-stale'
  | 'min-fresh'
  | 'stale-while-revalidate'
  | 'stale-if-error';
type Revalidation = 'must-revalidate' | 'proxy-revalidate' | 'immutable';

export type CacheOpts = {
  cacheability: Cacheability;
  expirationKind: ExpirationType;
  /**
   * Default 3600
   */
  expirationSeconds?: number;
  revalidation?: Revalidation;
};

const statusTuples = Object.entries(StatusCodes).reduce((acc, [name, status]) => {
  acc[status] = StatusPhrases[name];
  return acc;
}, {} as Codes);

export class BareRequest {
  ID: { code: string };
  params: { [k: string]: string | undefined } = {};
  query: { [k: string]: string | undefined } = {};
  remoteIp?: string;
  requestBody?: any;
  requestHeaders: { [key: string]: any };
  statusToSend = 200;
  cm?: CookiesManager;
  sent = false;

  private cache = true;
  private startTime?: [seconds: number, nanoseconds: number];
  private startDate = new Date();
  private remoteClient = '';
  private requestTimeFormat?: 'ms' | 's';
  private headers: { [header: string]: string | string[] } = {};
  private cookies: { [cooke: string]: string } = {};
  private contentType?: keyof typeof ContentType;
  private timeout?: NodeJS.Timeout;

  constructor(
    public _originalRequest: IncomingMessage,
    public _originalResponse: ServerResponse,
    options?: { logging?: boolean; requestTimeFormat?: 'ms' | 's' },
  ) {
    this.ID = { code: (_originalRequest.headers['x-request-id'] as string) || generateId() };
    this.remoteIp = _originalRequest.socket.remoteAddress;
    this.contentType = this._originalRequest.headers['content-type'] as any;
    this.requestHeaders = this._originalRequest.headers;

    // this is a placeholder URL base that we need to make class working
    new url.URL(`http://localhost/${this._originalRequest.url}`).searchParams.forEach(
      (value, name) => (this.query[name] = value),
    );

    // parsed;
    _originalRequest['flow'] = this; // to receive flow object later on in the route handler

    this.addHeaders({
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Request-Id': this.ID.code,
    });

    if (options?.requestTimeFormat) {
      this.startTime = process.hrtime();
      this.requestTimeFormat = options.requestTimeFormat;
    }

    // call logging section
    if (options?.logging === true) {
      _originalResponse.on('close', () =>
        logHttp(
          this.headers,
          this.startDate,
          this.remoteClient,
          _originalRequest,
          _originalResponse,
        ),
      );
    }
  }

  private readBody() {
    if (['POST', 'PATCH', 'PUT'].includes(this._originalRequest.method!))
      return new Promise<void>((resolve, reject) => {
        const temp: any = [];
        this._originalRequest
          .on('data', (chunk) => temp.push(chunk))
          .on('end', () => {
            const parsed = this.classifyRequestBody(temp);
            if (types.isNativeError(parsed)) reject(parsed);
            this.requestBody = parsed;
            resolve();
          })
          .on('error', reject);
      });
  }

  private attachCookieManager(opts?: CookiesManagerOptions) {
    this.cm = new CookiesManager(opts, this);
  }

  private populateCookies() {
    this.cookies = this.cm?.parseCookie(this._originalRequest.headers.cookie) || {};
  }

  private classifyRequestBody(data: Buffer[]) {
    const wholeChunk = Buffer.concat(data);
    switch (this.contentType) {
      case 'text/plain':
        return wholeChunk.toString();
      case 'application/json':
        return JSONParse(wholeChunk.toString());
      case 'application/x-www-form-urlencoded':
        const store = {};
        for (const curr of wholeChunk.toString().split('&')) {
          const [key, value] = curr.split('=');
          if (!key || !value) return null; // form urlencoded is not correct
          store[key] = value;
        }

        return store;
      default:
        return wholeChunk;
    }
  }

  private setRemoteClient(remoteClient: string) {
    this.remoteClient = remoteClient;
  }

  private setRequestTime() {
    if (!this.requestTimeFormat) return;

    const diff = process.hrtime(this.startTime);

    const time =
      diff[0] * (this.requestTimeFormat === 's' ? 1 : 1e3) +
      diff[1] * (this.requestTimeFormat === 's' ? 1e-9 : 1e-6);

    this.setHeaders({
      'X-Processing-Time': time,
      'X-Processing-Time-Mode': this.requestTimeFormat === 's' ? 'seconds' : 'milliseconds',
    });
  }

  private cleanHeader(header: string) {
    delete this.headers[header];
  }

  private attachTimeout(timeout: number) {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.status(503)._send('Server aborted connection by overtime');
    }, timeout);

    // attach listener to clear the timeout
    this._originalResponse.on('close', () => this.timeout && clearTimeout(this.timeout));
  }

  private setParams(params: { [k: string]: string | undefined }) {
    this.params = params;
  }

  // ======== PUBLIC APIS ========

  getHeader(header: string) {
    return this.headers[header];
  }

  getCookie(cookie: string) {
    return this.cookies[cookie];
  }

  getCookies() {
    return { ...this.cookies };
  }

  disableCache() {
    this.cache = false;
  }

  setCache(cacheOpts: CacheOpts) {
    const cacheHeader: string[] = [];
    const directive = 'Cache-Control';

    if (cacheOpts.cacheability) cacheHeader.push(cacheOpts.cacheability);
    if (cacheOpts.expirationKind)
      cacheHeader.push(`${cacheOpts.expirationKind}=${cacheOpts.expirationSeconds ?? 3600}`);
    if (cacheOpts.revalidation) cacheHeader.push(cacheOpts.revalidation);

    if (cacheHeader.length > 0) this.setHeader(directive, cacheHeader);
  }

  addHeader(header: string, value: string | number | string[] | number[]) {
    const old = this.headers[header];
    const parsedVal = Array.isArray(value) ? value.join(', ') : '' + value;
    if (old) {
      this.headers[header] += `, ${parsedVal}`;
    } else {
      this.headers[header] = parsedVal;
    }
  }

  setHeader(header: string, value: string | number | string[] | number[]) {
    const parsedVal = Array.isArray(value) ? value.join(', ') : '' + value;
    this.headers[header] = parsedVal;
  }

  setHeaders(headers: { [header: string]: string | number | string[] | number[] }) {
    for (const [header, value] of Object.entries(headers)) {
      this.setHeader(header, value);
    }
  }

  addHeaders(headers: { [header: string]: string | number | string[] | number[] }) {
    for (const [header, value] of Object.entries(headers)) {
      this.addHeader(header, value);
    }
  }

  status(status: StatusCodesUnion) {
    this.statusToSend = status;
    return this;
  }

  sendStatus(status: StatusCodesUnion) {
    this.status(status)._send();
  }

  stream<T extends NodeJS.WritableStream>(stream: T) {
    this._originalResponse.pipe(stream, { end: true });
  }

  json(data: any) {
    // to generate with fast-json-stringify schema issue #1
    const jsoned = JSONStringify(data);
    this.setHeader('Content-Type', 'application/json');
    this._send(jsoned ? jsoned : undefined);
  }

  _send(chunk?: string | ArrayBuffer | NodeJS.ArrayBufferView | SharedArrayBuffer) {
    if (this._originalResponse.socket?.destroyed) {
      logMe.error("Tying to send into closed client's stream");
      return;
    }

    if (this._originalResponse.headersSent || this.sent) {
      logMe.error('Trying to send with the headers already sent');
      return;
    }

    this.sent = true;

    let toSend = chunk;
    switch (chunk?.constructor) {
      case Uint16Array:
      case Uint8Array:
      case Uint32Array:
        toSend = Buffer.from((chunk as any).buffer);
    }

    // work basic headers
    if (typeof chunk !== 'undefined' && chunk !== null)
      this.setHeader('Content-Length', Buffer.byteLength(chunk, 'utf-8'));

    if (!this.cache)
      this.setHeaders({ 'Cache-Control': 'no-store', Expire: 0, Pragma: 'no-cache' });

    if (this.statusToSend >= 400 && this.statusToSend !== 404 && this.statusToSend !== 410)
      this.cleanHeader('Cache-Control');

    this.setRequestTime();

    // perform sending
    this._originalResponse.writeHead(
      this.statusToSend,
      statusTuples[this.statusToSend],
      this.headers,
    );
    this._originalResponse.end(toSend);
  }

  send(anything?: any) {
    if (this.sent) return;
    if (typeof anything === 'undefined' || anything === null) return this._send();

    switch (anything.constructor) {
      case Uint8Array:
      case Uint16Array:
      case Uint32Array:
      case Buffer:
      case String:
        this._send(anything);
        break;
      case Boolean:
      case Number:
        this._send('' + anything);
      case Writable:
        this.stream(anything);
        break;
      case Object:
        this.json(anything);
        break;
      default:
        this._send();
        logMe.warn('Unknown type to send');
    }
  }
}
