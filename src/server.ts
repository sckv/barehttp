import Router from 'find-my-way';

import { BareRequest } from './request';
import { logMe } from './logger';
import { context, enableContext, newContext } from './context';
import { generateReport } from './report';

import dns from 'dns';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { Writable } from 'stream';

type Middleware = (flow: BareRequest) => Promise<void> | void;
type Handler = (flow: BareRequest) => any;
type ErrorHandler = (err: any, flow: BareRequest) => void;
type ServerParams = {
  middlewares?: Array<Middleware>;
  swaggerRoute?: string;
  bodyParserLimit?: '512kb' | '1mb' | '2mb' | '4mb' | '8mb' | '16mb';
  serverPort?: number;
  disableEtag?: boolean;
  enableRequestAbort?: boolean;
  /**
   * Default `true`
   */
  context?: boolean;
  /**
   * Default `true`
   */
  logging?: boolean;
  errorHandlerMiddleware?: ErrorHandler;
  /**
   * Default 's' - seconds
   */
  requestTimeFormat?: 's' | 'ms';
};
type RouteOpts = {
  disableCache?: boolean;
};
type Methods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
const HttpMethods = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH',
  options: 'OPTIONS',
  head: 'HEAD',
} as const;

export type RouteReport = { hits: number; success: number; fails: number };

export class BareServer {
  #server: Server | null = null;
  #middlewares: Array<Middleware> = [];
  #routes: Map<string, RouteReport> = new Map();
  #router = Router({ ignoreTrailingSlash: true });
  #flows: Map<string, BareRequest> = new Map();
  #errorHandler: ErrorHandler;

  private generatedMiddlewares: any | (() => (flow: BareRequest) => void);

  constructor(private params: ServerParams = {}) {
    if (params.context) enableContext();

    this.#server = createServer(this.listener.bind(this));
    this.#errorHandler = params?.errorHandlerMiddleware || this.basicErrorHandler;
    params?.middlewares?.forEach((m) => this.use(m));
    this.registerReport();
    return this;
  }

  private listener(request: IncomingMessage, response: ServerResponse) {
    const { requestTimeFormat } = this.params;

    const flow = new BareRequest(this.params.logging, request, response);

    newContext('request');
    context.current?.store.set('id', flow.uuid);

    if (requestTimeFormat) flow.setTimeFormat(requestTimeFormat);

    request.on('close', () => this.#flows.delete(flow.uuid)); // remove already finished flow from the memory

    this.#flows.set(flow.uuid, flow);
    this.applyMiddlewares(flow.uuid);
  }

  /**
   * This function generates defined middlewares for the sequential execution
   */
  private writeMiddlewares() {
    const lines: string[] = [];
    let order = 0;
    const maxOrder = this.#middlewares.length;

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    if (maxOrder > 0) {
      while (order <= maxOrder - 1) {
        lines.push(`await this.resolveMiddleware(${order}, flow);`);
        order++;
      }
    }

    const text = lines.join('\n');

    this.generatedMiddlewares = new AsyncFunction('flow', text) as any;
  }

  private async applyMiddlewares(flowId: string) {
    const flow = this.#flows.get(flowId)!;
    await flow.readBody();

    // to test in cloud provider
    const remoteClient = await dns.promises.reverse(flow.remoteIp!);
    flow.setRemoteClient(remoteClient[0]);

    if (this.#middlewares.length) await this.generatedMiddlewares(flow);
    this.#router.lookup(flow._originalRequest, flow._originalResponse);
  }

  private async resolveMiddleware(order: number, flow: BareRequest) {
    try {
      const response = this.#middlewares[order](flow);
      if (response instanceof Promise) await response;
    } catch (e) {
      this.#errorHandler(e, flow);
    }
  }

  start(cb?: (address: string) => void) {
    const port = this.params?.serverPort || process.env.PORT || 3000;

    // https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
    this.#server?.listen(+port, '0.0.0.0', undefined, () =>
      cb ? cb(`http://localhost:${port}`) : void 0,
    );
  }

  stop(cb?: (e?: Error) => void) {
    for (const flow of Object.values(this.#flows)) {
      if (!flow._originalResponse.headersSent) {
        flow.status(500);
        flow.send('Server terminated');
      }
    }
    this.#server?.close(cb);
  }

  use(middleware: Middleware) {
    this.#middlewares.push(middleware);
    this.writeMiddlewares();
    return this;
  }

  get route() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return new Proxy(
      {},
      {
        get(_, key) {
          if (typeof key === 'symbol') return self;

          if (Object.keys(HttpMethods).includes(key as string)) {
            return function (...args: any[]) {
              self.setRoute(HttpMethods[key], args[0], args[1], args[2]);
              return self;
            };
          }

          return self;
        },
      },
    ) as Readonly<
      {
        [K in keyof typeof HttpMethods]: <R extends `/${string}`>(
          route: R,
          handler: Handler,
          opts?: RouteOpts,
        ) => BareServer;
      }
    >;
  }

  private setRoute(method: Methods, route: string, handler: Handler, opts?: RouteOpts) {
    const encode = this.encodeRoute(method, route);
    this.#routes.set(encode, { hits: 0, fails: 0, success: 0 });

    this.#router.on(method, route, (req, _, routeParams) => {
      this.#routes.get(encode)!.hits++;
      this.handleRoute(req, routeParams, handler, encode, opts);
    });
  }

  private registerReport() {
    this.setRoute('GET', '/_report', (flow) => {
      flow.setHeader('content-type', 'text/html');
      flow.send(generateReport(this.#routes));
    });
  }

  private handleRoute(
    req: IncomingMessage,
    routeParams: { [k: string]: string | undefined },
    handler: Handler,
    encodedRoute: string,
    opts?: RouteOpts,
  ) {
    const flow = this.#flows.get((req as any).id)!;

    // apply possible options
    if (opts?.disableCache) flow.disableCache();
    if (routeParams) flow.setParams(routeParams);

    flow._originalRequest.on('close', () => {
      if (flow.statusToSend < 300 && flow.statusToSend >= 200) {
        this.#routes.get(encodedRoute)!.success++;
      } else {
        this.#routes.get(encodedRoute)!.fails++;
      }
    });
    try {
      const routeReturn = handler(flow);
      if (routeReturn instanceof Promise) {
        routeReturn
          .catch((e) => this.#errorHandler(e, flow))
          .then((routeReturn) => {
            if (routeReturn) this.soundRouteReturn(routeReturn, flow);
          });
      } else {
        if (routeReturn) this.soundRouteReturn(routeReturn, flow);
      }
    } catch (e) {
      this.#errorHandler(e, flow);
    }
  }

  private soundRouteReturn(response: any, flow: BareRequest) {
    if (flow._originalResponse.headersSent) return;

    switch (response.constructor) {
      case Uint8Array:
      case Uint16Array:
      case Uint32Array:
      case ArrayBuffer:
      case Buffer:
      case Number:
        flow.send(response);
        break;
      case Writable:
        flow.stream(response);
        break;
      case String:
        flow.json(response);
        break;
      default:
        logMe.warn('Unknown type to send');
    }
  }

  private encodeRoute(method: string, route: string, opts?: RouteOpts) {
    return `${method} ${route}`;
  }

  getRoutes() {
    return [...this.#routes.keys()];
  }

  private basicErrorHandler(e: any, flow: BareRequest) {
    flow.status(500);
    flow.json({ ...e, message: e.message, stack: e.stack });
  }
}
