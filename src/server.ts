import Router from 'find-my-way';
import { ServerOptions } from 'ws';

import { BareRequest, CacheOpts } from './request';
import { logMe } from './logger';
import { context, enableContext, newContext } from './context';
import { generateReport } from './report';
import { CookiesManagerOptions } from './middlewares/cookies/cookie-manager';
import {
  HttpMethods,
  HttpMethodsUnion,
  HttpMethodsUnionUppercase,
  StatusCodes,
  StatusCodesUnion,
} from './utils';
import { Cors, CorsOptions } from './middlewares/cors/cors';
import { WebSocketServer } from './websocket';

import dns from 'dns';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';

type Middleware = (flow: BareRequest) => Promise<void> | void;
type Handler<P> = (flow: BareRequest<P>) => any;
type ErrorHandler = (err: any, flow: BareRequest, status?: StatusCodesUnion) => void;

type IP = `${number}.${number}.${number}.${number}`;
type RouteOpts<C> = {
  disableCache?: C extends true ? C : undefined;
  cache?: C extends true ? undefined : CacheOpts;
  /**
   * Request timeout handler in `ms`
   */
  timeout?: number;
};

type BareOptions<A extends IP> = {
  middlewares?: Array<Middleware>;
  serverPort?: number;
  /**
   * Address to bind the web server to
   * Default '0.0.0.0'
   */
  serverAddress?: A | 'localhost';
  /**
   * Enable request context storage
   * Default `false`
   */
  context?: boolean;
  /**
   * Enable request/response predefined logging
   * Default `false`
   */
  logging?: boolean;
  errorHandlerMiddleware?: ErrorHandler;
  /**
   * Request time format in `seconds` or `milliseconds`
   * Default - disabled
   */
  requestTimeFormat?: 's' | 'ms';
  /**
   * Control over cookies.
   * This will enable automatic cookies decoding
   */
  cookies?: boolean;
  cookiesOptions?: CookiesManagerOptions;
  /**
   * Log the resolved reverse DNS first hop for remote ip of the client (first proxy)
   */
  reverseDns?: boolean;
  /**
   * Exposes a report with the routes usage.
   * Default `false`
   */
  statisticsReport?: boolean;
  /**
   * WebSocket server exposure
   */
  ws?: boolean;
  wsOptions?: Omit<ServerOptions, 'host' | 'port' | 'server' | 'noServer'> & {
    closeHandler?: (server: WebSocketServer) => Promise<void>;
  };
  /**
   * Enable Cors
   */
  cors?: boolean | CorsOptions;
};

// === utility types for params inference

type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
  ? []
  : S extends `${infer T}${D}${infer U}`
  ? [...Split<T, '/'>, ...Split<U, D>]
  : [S];

type StringArrayToObject<S> = S extends [infer F, ...infer U]
  ? F extends keyof any
    ? { [K in F]: string } & StringArrayToObject<U>
    : any
  : unknown;

type RemoveFirst<S extends string[]> = S extends [infer F, ...infer X]
  ? X extends string[]
    ? StringArrayToObject<X>
    : F
  : never;

// === utility types ===

interface HandlerExposed<K, T> {
  <R extends string, C>(
    setUp: K extends 'declare'
      ? {
          route: `/${R}`;
          options?: RouteOpts<C>;
          handler: Handler<Split<R, ':'>>;
          methods: Array<HttpMethodsUnion>;
        }
      : {
          route: `/${R}`;
          options?: RouteOpts<C>;
          handler: Handler<RemoveFirst<Split<R, ':'>>>;
        },
  ): BareServer<any> & Routes;
}

export type RouteReport = { hits: number; success: number; fails: number };
export type Routes = {
  [K in HttpMethodsUnion | 'declare']: HandlerExposed<K, any>;
};
export type BareHttpType<A extends IP = any> = BareServer<A> & Routes;
export type ServerMergedType = {
  new <A extends IP>(args?: BareOptions<A>): BareHttpType<A>;
};

export class BareServer<A extends IP> {
  server: Server;
  ws?: WebSocketServer;

  #middlewares: Array<Middleware> = [];
  #routes: Map<string, RouteReport> = new Map();
  #routesLib: Map<string, any> = new Map();
  #router = Router({ ignoreTrailingSlash: true });
  #errorHandler: ErrorHandler = this.basicErrorHandler;
  #corsInstance?: Cors;
  #port = 3000;
  #host = '0.0.0.0';

  #runMiddlewaresSequence: (flow: BareRequest) => void = (_) => _;

  constructor(private bareOptions: BareOptions<A> = {}) {
    // init
    this.server = createServer(this.#listener.bind(this));
    this.attachGracefulHandlers();
    this.attachRoutesDeclarator();
    this.mainOptionsSetter();

    return this;
  }

  #listener = (request: IncomingMessage, response: ServerResponse) => {
    const { requestTimeFormat, logging } = this.bareOptions;

    const flow = new BareRequest(request, response, { logging, requestTimeFormat });

    // init and attach request uuid to the context
    if (this.bareOptions.context) {
      newContext('request');
      context.current?.store.set('id', flow.ID.code);
    }

    // attach a flow to the flow memory storage
    this.applyMiddlewares(flow).catch((e) => this.#errorHandler(e, flow, 400));
  };

  /**
   * This function generates previously defined middlewares for the sequential execution
   */
  #writeMiddlewares = () => {
    const lines: string[] = [];
    let order = 0;
    const maxOrder = this.#middlewares.length;

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    if (maxOrder > 0) {
      while (order <= maxOrder - 1) {
        lines.push(`if (flow.sent) return;`);
        lines.push(`await this.resolveMiddleware(flow, ${order});`);
        order++;
      }
    }

    const text = lines.join('\n');

    this.#runMiddlewaresSequence = new AsyncFunction('flow', text);
  };

  private mainOptionsSetter = () => {
    const { bareOptions: bo } = this;

    this.#port = +(bo.serverPort || process.env.PORT || 3000);
    this.#host = typeof bo.serverAddress === 'string' ? bo.serverAddress : '0.0.0.0';

    // context setting
    if (bo.context) enableContext();

    // ws attachment
    if (bo.ws) {
      this.ws = new WebSocketServer(this.server, bo.wsOptions);
    }

    // middlewares settings
    if (bo.errorHandlerMiddleware) {
      this.#errorHandler = bo.errorHandlerMiddleware;
    }

    if (this.bareOptions.cors) {
      const corsOpts = typeof this.bareOptions.cors === 'object' ? this.bareOptions.cors : {};
      this.#corsInstance = new Cors(corsOpts);
    }

    this.#middlewares.push(...(bo.middlewares || []));
    if (bo.statisticsReport) this.registerReport();
  };

  private async applyMiddlewares(flow: BareRequest) {
    if (!flow) {
      throw new Error(
        `No flow been found to apply middlewares for, theres a sync mistake in the server.`,
      ); // should NEVER happen
    }

    if (this.bareOptions.cors) {
      this.resolveMiddleware(flow, 0, this.#corsInstance?.corsMiddleware.bind(this.#corsInstance));
    }

    // invoke body stream consumption
    await flow['readBody']();

    // attach cookies middleware
    if (this.bareOptions.cookies) {
      flow['attachCookieManager'](this.bareOptions.cookiesOptions);
      flow['populateCookies']();
    }

    // to test in cloud provider
    // this should resolve the name of the first hop from the dns chain
    if (this.bareOptions.reverseDns) {
      const remoteClient = await dns.promises.reverse(flow.remoteIp!);
      flow['setRemoteClient'](remoteClient[0]);
    }

    if (this.#middlewares.length) await this.#runMiddlewaresSequence(flow);

    // now route the request if middlewares did not send the response back
    if (!flow.sent) {
      this.#router.lookup(flow._originalRequest, flow._originalResponse);
    }
  }

  /**
   * This handler is used in async generated middlewares runtime function
   */
  private async resolveMiddleware(flow: BareRequest, order: number, middleware?: Middleware) {
    try {
      const toExecute = middleware || this.#middlewares[order];
      const response = toExecute(flow);
      if (response instanceof Promise) await response;
    } catch (e: any) {
      this.#errorHandler(e, flow);
    }
  }

  private setRoute(
    method: HttpMethodsUnionUppercase,
    route: string,
    runtime: boolean,
    handler: Handler<any>,
    opts?: RouteOpts<any>,
  ) {
    const encode = this.encodeRoute(method, route);
    this.#routes.set(encode, { hits: 0, fails: 0, success: 0 });

    const handleFn = (req, _, routeParams) => {
      this.#routes.get(encode)!.hits++;

      this.handleRoute(req, checkParams(routeParams), handler, encode, opts);
    };

    this.#routesLib.set(encode, handleFn);

    if (runtime) {
      this.#router.reset();

      this.#routesLib.forEach((handlerFn, route) => {
        const [m, r] = this.explodeRoute(route);

        this.#router.on(m, r, handlerFn);
      });
    } else {
      this.#router.on(method, route, handleFn);
    }
  }

  private registerReport() {
    this.setRoute('GET', '/_report', false, (flow) => {
      flow.setHeader('Content-Type', 'text/html');
      flow.send(generateReport(this.#routes));
    });
  }

  private handleRoute(
    req: IncomingMessage,
    routeParams: { [k: string]: string | undefined },
    handle: Handler<any>,
    encodedRoute: string,
    opts?: RouteOpts<any>,
  ) {
    const flow = (req as any).flow as BareRequest;

    if (!flow) {
      throw new Error(
        `No flow been found to route this request, theres a sync mistake in the server.`,
      ); // should NEVER happen
    }

    // apply possible route options
    if (opts) {
      if (opts.disableCache) flow.disableCache();
      if (opts.cache) flow.setCache(opts.cache);
      if (opts.timeout) flow['attachTimeout'](opts.timeout);
    }

    // populate with route params
    if (routeParams) flow['setParams'](routeParams);

    // attach a general statistic reports counter
    if (this.bareOptions.statisticsReport) {
      flow._originalRequest.on('close', () => {
        if (flow.statusToSend < 300 && flow.statusToSend >= 200) {
          this.#routes.get(encodedRoute)!.success++;
        } else {
          this.#routes.get(encodedRoute)!.fails++;
        }
      });
    }

    try {
      const routeReturn = handle.bind(undefined)(flow);
      if (routeReturn instanceof Promise) {
        routeReturn.then((result) => flow.send(result)).catch((e) => this.#errorHandler(e, flow));
      } else {
        flow.send(routeReturn);
      }
    } catch (e: any) {
      this.#errorHandler(e, flow);
    }
  }

  private encodeRoute(method: string, route: string) {
    if (route.endsWith('/')) route = route.slice(0, -1);
    return `${method}?${route}`;
  }

  private explodeRoute(route: string) {
    return route.split('?') as [method: HttpMethodsUnionUppercase, route: string];
  }

  private basicErrorHandler(
    e: any,
    flow: BareRequest,
    status?: typeof StatusCodes[keyof typeof StatusCodes],
  ) {
    flow.status(status ?? 500).json({ ...e, message: e.message, stack: e.stack });
  }

  private async stopWs() {
    if (!this.ws) return;

    if (this.bareOptions.wsOptions?.closeHandler) {
      await this.bareOptions.wsOptions.closeHandler(this.ws);
    }

    this.ws._internal.close();
  }

  private attachGracefulHandlers() {
    const graceful = async (code = 0) => {
      await this.stop();
      process.exit(code);
    };

    // Stop graceful
    process.on('uncaughtException', (err) => {
      console.error(err);
      graceful(1);
    });

    process.on('unhandledRejection', (err) => {
      console.error(err);
    });

    process.on('SIGTERM', graceful);
    process.on('SIGINT', graceful);
  }

  private attachRoutesDeclarator() {
    for (const method of [...Object.keys(HttpMethods), 'declare']) {
      this[method] = (routeSetUp: any) => {
        checkRouteSetUp(routeSetUp, method);

        if (method === 'declare') {
          for (const m of new Set<string>(routeSetUp.methods))
            this.setRoute(
              HttpMethods[m],
              routeSetUp.route,
              false,
              routeSetUp.handler,
              routeSetUp.options,
            );
        } else {
          this.setRoute(
            HttpMethods[method],
            routeSetUp.route,
            false,
            routeSetUp.handler,
            routeSetUp.options,
          );
        }

        return this;
      };
    }
  }

  // ========= PUBLIC APIS ==========

  // TODO: add working options setter
  // setOption<B extends BareOptions<any>, O extends keyof B>(option: O, arg: B[O]) {
  //   throw new Error('Not implemented')
  // }

  get runtimeRoute() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return new Proxy({} as Readonly<Routes>, {
      get(_, key) {
        if (typeof key === 'symbol') return this;
        if (!self.server?.listening) {
          console.warn(
            'Runtime route declaration can be done only while the server is running. Follow documentation for more details',
          );
          return this;
        }

        if ([...Object.keys(HttpMethods), 'declare'].includes(key as string)) {
          return (routeSetUp: any) => {
            checkRouteSetUp(routeSetUp, key);
            if (key === 'declare') {
              for (const m of new Set<string>(routeSetUp.methods))
                self.setRoute(
                  HttpMethods[m],
                  routeSetUp.route,
                  true,
                  routeSetUp.handler,
                  routeSetUp.options,
                );
            } else {
              self.setRoute(
                HttpMethods[key],
                routeSetUp.route,
                true,
                routeSetUp.handler,
                routeSetUp.options,
              );
            }
            return this;
          };
        }

        return this;
      },
    });
  }

  start(cb?: (address: string) => void) {
    this.#writeMiddlewares();
    this.ws?.['_start']();
    return new Promise<void>((res) =>
      // https://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback
      this.server.listen(this.#port, this.#host, undefined, () => {
        cb ? cb(`http://0.0.0.0:${this.#port}`) : void 0;
        res();
      }),
    );
  }

  async stop(cb?: (e?: Error) => void) {
    // TODO: to solve problem announcing to clients the disconnect
    // for (const flow of this.#flows.values()) {
    //   if (!flow.sent) {
    //     flow.status(500);
    //     flow.send('Server terminated');
    //   }
    // }
    if (!this.ws) await this.stopWs();
    await new Promise<void>((res, rej) => {
      this.server?.close((e) => {
        if (e) {
          rej(e);
          cb?.(e);
        } else {
          cb?.();
          res();
        }
      });
    });
  }

  use(middleware: Middleware) {
    this.#middlewares.push(middleware);
    return this;
  }

  getMiddlewares(): Middleware[] {
    return this.#middlewares;
  }

  setCustomErrorHandler(eh: ErrorHandler) {
    this.#errorHandler = eh;
  }

  getRoutes() {
    return [...this.#routes.keys()];
  }
}

function checkRouteSetUp(routeSetUp: { [setting: string]: any }, key: string) {
  if (typeof routeSetUp.route !== 'string') {
    throw new TypeError(`A route path for the method ${key} is not a a string`);
  } else if (routeSetUp.route[0] !== '/') {
    throw new SyntaxError(
      `A route path should start with '/' for route ${routeSetUp.route} for method ${key}`,
    );
  } else if (routeSetUp.route[1] === '/') {
    throw new SyntaxError(
      `Declared route ${routeSetUp.route} for method ${key} is not correct, review the syntax`,
    );
  } else if (typeof routeSetUp.handler !== 'function') {
    throw new TypeError(
      `Handler for the route ${routeSetUp.route} for method ${key} is not a function`,
    );
  } else if (
    routeSetUp.options?.timeout &&
    typeof routeSetUp.options.timeout !== 'number' &&
    !Number.isFinite(routeSetUp.options.timeout)
  ) {
    throw new TypeError(
      `Only numeric values are valid per-route timeout, submitted ${routeSetUp.options.timeout}`,
    );
  }
}

function checkParams(params: { [param: string]: string | undefined }) {
  if (!params || Object.keys(params).length === 0) return params;
  for (const [param, value] of Object.entries(params)) {
    if (value === undefined) continue;

    if (/(\.\/)(\.\.)(\\.)/.test(decodeURI(value))) {
      logMe.warn(
        `Param ${param} value ${value} was redacted because contained dangerous characters`,
      );
      param[param] = 'REDACTED';
    }
  }

  return params;
}

const BareHttp = BareServer as ServerMergedType;

export { BareHttp };
