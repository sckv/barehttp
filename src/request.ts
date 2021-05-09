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
export class RequestFlow {
  request: WebRequest;
  response: WebResponse;
  uuid: string;
  params: { [k: string]: string | undefined } = {};
  private status: number | undefined;

  constructor(public originalRequest: IncomingMessage, public originalResponse: ServerResponse) {
    this.request = pickFrom(originalRequest, ...requestKeys);
    this.response = pickFrom(originalResponse, ...responseKeys);
    this.uuid = (originalRequest.headers['x-request-id'] as string) || uuidv4();
    (originalRequest as any).id = this.uuid;
  }

  setParams(params: { [k: string]: string | undefined }) {
    this.params = params;
  }

  setHeader(header: string, value: string) {
    this.originalResponse.setHeader(header, value);
    return this;
  }

  setHeaders(headers: { [header: string]: string }) {
    Object.entries(headers).forEach(([header, value]) => {
      this.originalResponse.setHeader(header, value);
    });
    return this;
  }

  setStatus(status: typeof StatusCodes[keyof typeof StatusCodes]) {
    this.status = status;
    return this;
  }

  sendStatus(status: typeof StatusCodes[keyof typeof StatusCodes]) {
    this.setStatus(status);
    this.send(StatusPhrases.ACCEPTED);
  }

  send(chunk: any) {
    this.originalResponse.write(chunk, 'utf-8', (e) => {
      if (e) throw e;
    });
    this.originalResponse.end();
  }
}
