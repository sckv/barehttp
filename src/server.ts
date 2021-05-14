import Router from 'find-my-way';

import { FlowRequest } from './request';
import { logMe } from './logger';
import { context, enableContext, newContext } from './context';

import dns from 'dns';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { Writable } from 'stream';

type Middleware = (flow: FlowRequest) => Promise<void> | void;
type Handler = (flow: FlowRequest) => any;
type ErrorHandler = (err: any, flow: FlowRequest) => void;
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

export class FlowServer {
  #server: Server | null = null;
  #middlewares: Array<Middleware> = [];
  #routes: Set<string> = new Set();
  #router = Router({ ignoreTrailingSlash: true });
  #flows: Map<string, FlowRequest> = new Map();
  #errorHandler: ErrorHandler;

  private generatedMiddlewares: any | (() => (flow: FlowRequest) => void);

  constructor(private params: ServerParams = {}) {
    if (params.context) enableContext();

    this.#server = createServer(this.listener.bind(this));
    this.#errorHandler = params?.errorHandlerMiddleware || this.basicErrorHandler;
    params?.middlewares?.forEach((m) => this.use(m));
    return this;
  }

  private listener(request: IncomingMessage, response: ServerResponse) {
    const { requestTimeFormat } = this.params;

    const flow = new FlowRequest(this.params.logging, request, response);

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

    lines.push('return async () => {');

    if (maxOrder > 0) {
      while (order <= maxOrder - 1) {
        lines.push(`await this.resolveMiddleware(${order}, flow);`);
        order++;
      }
    }

    lines.push('}');

    const text = lines.join('\n');

    this.generatedMiddlewares = new Function('flow', text) as any;
  }

  private async applyMiddlewares(flowId: string) {
    const flow = this.#flows.get(flowId)!;

    // to test in cloud provider
    const remoteClient = await dns.promises.reverse(flow.remoteIp!);
    flow.setRemoteClient(remoteClient[0]);

    if (this.#middlewares.length) await this.generatedMiddlewares(flow)();
    this.#router.lookup(flow._originalRequest, flow._originalResponse);
  }

  private async resolveMiddleware(order: number, flow: FlowRequest) {
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
          if (Object.keys(HttpMethods).includes(key as string)) {
            return function (...args: any[]) {
              self.#routes.add(self.encodeRoute(HttpMethods.get, args[0], args[2]));
              self.setRoute(HttpMethods.get, args[0], args[1], args[2]);
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
        ) => FlowServer;
      }
    >;
  }

  private setRoute(method: Methods, route: string, handler: Handler, opts?: RouteOpts) {
    this.#router.on(method, route, (req, _, routeParams) =>
      this.handleRoute(req, routeParams, handler, opts),
    );
  }

  private handleRoute(
    req: IncomingMessage,
    routeParams: { [k: string]: string | undefined },
    handler: Handler,
    opts?: RouteOpts,
  ) {
    const flow = this.#flows.get((req as any).id)!;

    // apply possible options
    if (opts?.disableCache) flow.disableCache();
    if (routeParams) flow.setParams(routeParams);

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

  private soundRouteReturn(response: any, flow: FlowRequest) {
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

  private basicErrorHandler(e: any, flow: FlowRequest) {
    flow.sendStatus(500);
  }
}
