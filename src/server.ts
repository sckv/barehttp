import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'http';
import { RequestFlow } from './request';

type Middleware = (req: IncomingMessage, res: ServerResponse) => void;
type Handler = (req: IncomingMessage, res: ServerResponse) => void;

export class WebServer {
  #server: Server | null = null;

  middlewares: Set<Middleware> = new Set();
  routes: Map<string, Handler> = new Map();

  constructor() {
    this.#server = createServer();
    return this;
  }

  listener(request: IncomingMessage, response: ServerResponse) {
    const flow = new RequestFlow(request, response);
  }

  use(middleware: Middleware) {
    return this;
  }

  get(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('get', route), handler);
    return this;
  }
  post(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('post', route), handler);
    return this;
  }
  put(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('put', route), handler);
    return this;
  }
  patch(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('patch', route), handler);
    return this;
  }
  delete(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('delete', route), handler);
    return this;
  }
  options(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('options', route), handler);
    return this;
  }
  head(route: string, handler: Handler) {
    this.routes.set(this.encodeRoute('head', route), handler);
    return this;
  }

  encodeRoute(method: string, route: string) {
    return `${method.toUpperCase()}:${route}`;
  }

  getRoutes() {
    return [...this.routes.keys()];
  }
}
