import hyperid from 'hyperid';

import { StatusCodes, StatusPhrases } from './utils/';
import { JSONParse, JSONStringify } from './utils/safe-json';
import { logHttp } from './logger';
import { ContentType } from './utils/content-type';

import type { IncomingMessage, ServerResponse } from 'http';
const generateId = hyperid();

type Codes<K extends keyof typeof StatusCodes = keyof typeof StatusCodes> = {
  [L in typeof StatusCodes[K]]: typeof StatusPhrases[K];
};

const statusTuples = Object.entries(StatusCodes).reduce((acc, [name, status]) => {
  acc[status] = StatusPhrases[name];
  return acc;
}, {} as Codes);

export class BareRequest {
  uuid: string;
  params: { [k: string]: string | undefined } = {};
  remoteIp?: string;
  requestBody?: any;
  statusToSend = 200;

  private cache = true;
  private startTime: [seconds: number, nanoseconds: number];
  private startDate = new Date();
  private remoteClient = '';
  private countTimeFormat: 'ms' | 's' = 's';
  private headers: { [header: string]: string | number } = {};
  private contentType?: keyof typeof ContentType;

  constructor(
    callLog = true,
    public _originalRequest: IncomingMessage,
    public _originalResponse: ServerResponse,
  ) {
    this.uuid = (_originalRequest.headers['x-request-id'] as string) || generateId();
    this.remoteIp = _originalRequest.socket.remoteAddress;
    this.contentType = this._originalRequest.headers['content-type'] as any;

    _originalRequest['id'] = this.uuid; // to receive an id later on in the route handler

    this.setHeaders({ 'Content-Type': 'text/plain', 'X-Request-Id': this.uuid });
    this.startTime = process.hrtime();

    // call logging section
    if (callLog === false) return;
    _originalResponse.on('close', () =>
      logHttp(this.headers, this.startDate, this.remoteClient, _originalRequest, _originalResponse),
    );
  }

  readBody() {
    return new Promise<void>((resolve, reject) => {
      const temp: any = [];
      if (['POST', 'PATCH', 'PUT'].includes(this._originalRequest.method!)) {
        this._originalRequest
          .on('data', (chunk) => temp.push(chunk))
          .on('end', () => {
            this.requestBody = this.classifyRequestBody(temp);
            resolve();
          })
          .on('error', reject);
      }
    });
  }

  classifyRequestBody(data: Buffer[]) {
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
        return Buffer.concat(data);
    }
  }

  setRemoteClient(remoteClient: string) {
    this.remoteClient = remoteClient;
  }

  private setRequestTime() {
    const diff = process.hrtime(this.startTime);

    const time =
      diff[0] * (this.countTimeFormat === 's' ? 1 : 1e3) +
      diff[1] * (this.countTimeFormat === 's' ? 1e-9 : 1e-6);

    this.setHeaders({
      'X-Processing-Time': time,
      'X-Processing-Time-Mode': this.countTimeFormat === 's' ? 'seconds' : 'milliseconds',
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
    this.send(jsoned ? jsoned : undefined);
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
