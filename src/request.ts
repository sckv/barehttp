import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'http';
import type { Socket } from 'net';

type WebRequest = {
  headers: IncomingHttpHeaders;
  rawHeaders: string[];
  aborted: boolean;
  complete: boolean;
  destroyed: boolean;
  destroy(error?: Error | undefined): void;
  pipe<T>(
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
  socket: Socket;
  statusCode: number;
  headersSent: boolean;
  chunkedEncoding: boolean;
  destroyed: boolean;
  pipe<T>(
    destination: T,
    options?:
      | {
          end?: boolean | undefined;
        }
      | undefined,
  ): T;
  shouldKeepAlive: boolean;
  on: ServerResponse['on'];
};

export class RequestFlow {
  constructor(
    private request: IncomingMessage,
    private response: ServerResponse,
  ) {}
}
