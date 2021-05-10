import EventEmitter from 'events';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'http';
import { RequestFlow } from './request';
import Router from 'find-my-way';

type Middleware = (flow: RequestFlow) => Promise<void> | void;
type Handler = (flow: RequestFlow) => any;
type ErrorHandler = (err: any, flow: RequestFlow) => void;
type ServerParams = {
  middlewares?: Array<Middleware>;
  swaggerRoute?: string;
  bodyParserLimit?: '512kb' | '1mb' | '2mb' | '4mb' | '8mb' | '16mb';
  serverPort?: number;
  disableEtag?: boolean;
  enableRequestAbort?: boolean;
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

export class WebServer {
  #server: Server | null = null;
  #middlewares: Array<Middleware> = [];
  #routes: Set<string> = new Set();
  #router = Router({ ignoreTrailingSlash: true });
  #flows: { [k: string]: RequestFlow } = {};
  #errorHandler: ErrorHandler;
  private generatedMiddlewares: any | (() => (flow: RequestFlow) => void);

  constructor(private params?: ServerParams) {
    this.#server = createServer(this.listener.bind(this));
    this.#errorHandler = params?.errorHandlerMiddleware || this.basicErrorHandler;
    params?.middlewares?.forEach((m) => this.use(m));
    return this;
  }

  private listener(request: IncomingMessage, response: ServerResponse) {
    const flow = new RequestFlow(request, response, {
      requestTimeFormat: this.params?.requestTimeFormat,
    });
    request.on('close', () => delete this.#flows[flow.uuid]); // remove already finished flow from the memory
    this.#flows[flow.uuid] = flow;
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
    const flow = this.#flows[flowId];
    if (this.#middlewares.length) await this.generatedMiddlewares(flow)();
    this.#router.lookup(flow._originalRequest, flow._originalResponse);
  }

  private async resolveMiddleware(order: number, flow: RequestFlow) {
    try {
      await this.#middlewares[order](flow);
    } catch (e) {
      this.#errorHandler(e, flow);
    }
  }

  start(cb?: (address: string) => void) {
    const port = this.params?.serverPort || process.env.PORT || 3000;
    this.#server?.listen(port, () => (cb ? cb(`http://localhost:${port}`) : void 0));
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
        ) => WebServer;
      }
    >;
  }

  private setRoute(method: Methods, route: string, handler: Handler, opts?: RouteOpts) {
    this.#router.on(method, route, (req, _, params) =>
      this.handleRoute(req, params, handler, opts),
    );
  }

  private handleRoute(
    req: IncomingMessage,
    params: { [k: string]: string | undefined },
    handler: Handler,
    opts?: RouteOpts,
  ) {
    const flow = this.#flows[(req as any).id];

    // apply possible options
    if (opts?.disableCache) flow.disableCache();
    flow.setParams(params);

    const response = handler(flow);
    if (response instanceof Promise) {
      response.catch((e) => this.#errorHandler(e, flow));
    }
  }

  private encodeRoute(method: string, route: string, opts?: RouteOpts) {
    return `${method} ${route}`;
  }

  getRoutes() {
    return [...this.#routes.keys()];
  }

  private basicErrorHandler(e: any, flow: RequestFlow) {
    flow.sendStatus(500);
  }
}
