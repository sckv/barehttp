import Router from 'find-my-way';
import { ServerOptions } from 'ws';
import { Ajv, ValidateFunction } from 'ajv';

import { BareRequest, CacheOpts } from './request.js';
import { configureLogger, logMe } from './logger/index.js';
import type { LoggerConfig } from './logger/index.js';
import { context, enableContext, newContext } from './context/index.js';
import { CookiesManagerOptions } from './middlewares/cookies/cookie-manager.js';
import {
  HttpMethods,
  HttpMethodsUnion,
  HttpMethodsUnionUppercase,
  StatusCodes,
  StatusCodesUnion,
} from './utils/index.js';
import { Cors, CorsOptions } from './middlewares/cors/cors.js';
import { WebSocketServer } from './websocket.js';
import { generateRouteSchema } from './schemas/generator.js';

import dns from 'dns';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';

type Middleware = (flow: BareRequest) => Promise<void> | void;
type Handler<H extends { [key: string]: string | undefined }> = (flow: BareRequest<H>) => any;
type ErrorHandler = (err: any, flow: BareRequest, status?: StatusCodesUnion) => void;

type IP = `${number}.${number}.${number}.${number}`;
type RouteOpts<C> = {
  disableCache?: C extends true ? C : undefined;
  cache?: C extends true ? undefined : CacheOpts;
  /**
   * Request timeout handler in `ms`
   */
  timeout?: number;
  builtInRuntime?: {
    output?: boolean;
  };
  middlewares?: Array<Middleware>;
};

type BareOptions<A extends IP> = {
  /**
   * Declare a global middlewares array
   * Default: []
   */
  middlewares?: Array<Middleware>;
  /**
   * Opt-out request body parsing (de-serialization)
   * Default `false`
   */
  doNotParseBody?: boolean;
  /**
   * Opt-in to have a custom swagger per route generation
   * Default `false`
   */
  // enableBuiltInSwagger?: boolean;
  /**
   * Opt-in to have a custom runtime JSON Schema checker per routes
   * Default `false`
   */
  enableSchemaValidation?: boolean;
  serverPort?: number;
  declaredRoutesPaths?: Array<string>;
  /**
   * Address to bind the web server to
   * Default '0.0.0.0'
   */
  serverAddress?: A | 'localhost';
  setRandomPort?: boolean;
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
  /**
   * Logger configuration. Controls outputs for app and http logs.
   */
  logger?: LoggerConfig;
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

type ExtractRouteParams<T extends string> = T extends `${string}:${infer Param}/${infer Rest}`
  ? { [K in Param | keyof ExtractRouteParams<Rest>]: string }
  : T extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : { [k: string]: string };

interface HandlerExposed<K> {
  <R extends `/${string}`, C>(
    setUp: K extends 'declare'
      ? {
          route: R;
          options?: RouteOpts<C>;
          handler: Handler<ExtractRouteParams<R>>;
          methods: Array<HttpMethodsUnion>;
        }
      : {
          route: R;
          options?: RouteOpts<C>;
          handler: Handler<ExtractRouteParams<R>>;
        },
  ): BareServer<any> & Routes;
}

export type RouteReport = { hits: number; success: number; fails: number };
export type Routes = {
  [K in HttpMethodsUnion | 'declare']: HandlerExposed<K>;
};
export type BareHttpType<A extends IP = any> = BareServer<A> & Routes;

export class BareServer<A extends IP> {
  server: Server;
  ws?: WebSocketServer;
  ajv?: Ajv;

  route: Readonly<Routes> = {} as any;

  #middlewares: Array<Middleware> = [];
  #routes: Map<string, RouteReport> = new Map();
  #routesLib: Map<string, any> = new Map();
  #router = Router({ ignoreTrailingSlash: true });
  #errorHandler: ErrorHandler = this.basicErrorHandler;
  #corsInstance?: Cors;
  #port = 3000;
  #host = '0.0.0.0';

  #globalMiddlewaresRun: (flow: BareRequest) => void = (_) => _;
  #routeMiddlewaresStore: Map<string, (flow: BareRequest) => void> = new Map();
  #routeRuntimeSchemas: Map<string, { raw: any; compiled: ValidateFunction }> = new Map();

  constructor(private bareOptions: BareOptions<A> = {}) {
    // init
    this.server = createServer(this.#listener.bind(this));
    this.attachGracefulHandlers();
    this.attachRoutesDeclarator();
    this.applyLaunchOptions();
    this.loadRoutesSchemas();

    return this;
  }

  #listener = (request: IncomingMessage, response: ServerResponse) => {
    const flow = new BareRequest(request, response, this.bareOptions);

    // init and attach request uuid to the context
    if (this.bareOptions.context) {
      newContext('request');
      context.current?.store.set('id', flow.ID.code);
    }

    // execute global middlewares on the request
    this.applyMiddlewares(flow)
      .catch((e) => {
        this.#errorHandler(e, flow, 400);
      })
      .then(() => {
        // if middlewares sent the response back, stop here
        if (flow.sent) return;
        this.#router.lookup(flow._originalRequest, flow._originalResponse);
      });
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

    this.#globalMiddlewaresRun = new AsyncFunction('flow', text);
  };

  private applyLaunchOptions = () => {
    const { bareOptions: bo } = this;

    if (bo.logger) configureLogger(bo.logger);

    if (bo.setRandomPort) {
      this.#port = undefined as any;
    } else {
      this.#port = +(bo.serverPort || process.env.PORT || 3000);
    }

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
  };

  private async applyMiddlewares(flow: BareRequest) {
    if (this.bareOptions.cors) {
      this.resolveMiddleware(flow, 0, this.#corsInstance?.corsMiddleware.bind(this.#corsInstance));
    }

    if (this.bareOptions.doNotParseBody !== true) {
      // invoke body stream consumption
      await flow['readBody']();
    }

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

    if (this.#middlewares.length) await this.#globalMiddlewaresRun(flow);
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
    isRuntime: boolean,
    handler: Handler<any>,
    opts?: RouteOpts<any>,
  ) {
    const encode = this.encodeRoute(method, route);

    const handleFn = (req, _, routeParams) => {
      this.handleRoute(req, checkParams(routeParams), handler, opts);
    };

    this.#routesLib.set(encode, handleFn);

    if (isRuntime) {
      this.#router.reset();

      this.#routesLib.forEach((handlerFn, route) => {
        const [m, r] = this.explodeRoute(route);

        this.#router.on(m, r, handlerFn);
      });
    } else {
      this.#router.on(method, route, handleFn);
    }
  }

  private handleRoute(
    req: IncomingMessage,
    routeParams: { [k: string]: string | undefined },
    handle: Handler<any>,
    routeOpts?: RouteOpts<any>,
  ) {
    const flow = (req as any).flow as BareRequest;

    if (!flow) {
      throw new Error(
        `No flow been found to route this request, theres a sync mistake in the server.`,
      ); // should NEVER happen
    }

    // populate with route params
    if (routeParams) flow['setParams'](routeParams);

    // apply possible route options
    if (routeOpts) {
      if (routeOpts.disableCache) flow.disableCache();
      if (routeOpts.cache) flow.setCache(routeOpts.cache);
      if (routeOpts.timeout) flow['attachTimeout'](routeOpts.timeout);
    }

    // TODO: implement per route middlewares!

    try {
      const routeReturn = handle(flow);
      if (flow.sent) return;

      if (routeReturn instanceof Promise) {
        routeReturn
          .then((result) =>
            this.resolveResponse(
              flow,
              result,
              req.url,
              req.method?.toLowerCase(),
              routeOpts?.builtInRuntime?.output,
            ),
          )
          .catch((e) => {
            this.#errorHandler(e, flow);
          });
        return;
      }

      this.resolveResponse(
        flow,
        routeReturn,
        req.url,
        req.method?.toLowerCase(),
        routeOpts?.builtInRuntime?.output,
      );
    } catch (e) {
      this.#errorHandler(e, flow);
    }
  }

  private resolveResponse(
    flow: BareRequest,
    response: any,
    url?: string,
    method?: string,
    builtInRuntime?: boolean,
  ) {
    if (!builtInRuntime || !method || !url) {
      flow.send(response);
      return;
    }
    const schema = this.#routeRuntimeSchemas.get(`${method}-${url}`);
    const check = schema?.compiled(response);

    if ((schema && check) || !schema) flow.send(response);
    else {
      logMe.error('Response schema error!', {
        method,
        url,
        errors: schema?.compiled.errors,
        received: response,
      });
      flow
        .status(500)
        .send({ message: `Response schema error, please communicate to server administrator.` });
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
    status?: (typeof StatusCodes)[keyof typeof StatusCodes],
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

    process.on('SIGTERM', () => graceful(0));
    process.on('SIGINT', () => graceful(0));
  }

  private attachRoutesDeclarator() {
    for (const method of [...Object.keys(HttpMethods), 'declare']) {
      this.route[method] = (routeSetUp: any) => {
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
        cb?.(`http://0.0.0.0:${this.#port}`);
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
    if (!this.server?.listening) return;

    await new Promise<void>((res, rej) => {
      this.server.close((e) => {
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

  loadRoutesSchemas() {
    if (!this.bareOptions.enableSchemaValidation) {
      return;
    }

    if (this.bareOptions.declaredRoutesPaths?.length) {
      this.ajv = new Ajv({ strict: true });
      for (const path of this.bareOptions.declaredRoutesPaths) {
        const schemas = generateRouteSchema(path);
        for (const schema of schemas) {
          this.#routeRuntimeSchemas.set(`${schema.methodName}-${schema.route}`, {
            raw: schema.jsonSchema,
            compiled: this.ajv.compile(schema.jsonSchema),
          });
        }
      }
    }
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

  getServerPort(): number {
    return (this.server.address() as any).port;
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

export { BareServer as BareHttp };
