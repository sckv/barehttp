"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const ws_1 = require("ws");
const callsites_1 = __importDefault(require("callsites"));
const hyperid_1 = __importDefault(require("hyperid"));
const logger_1 = require("./logger");
const utils_1 = require("./utils");
const generateId = (0, hyperid_1.default)();
class WebSocketServer {
    opts;
    _internal;
    #httpServer;
    #types = new Map();
    customUpgradeDone = false;
    constructor(server, opts = {}) {
        this.opts = opts;
        this.#httpServer = server;
    }
    _start() {
        if (!this._internal) {
            this.#createWServer({ server: this.#httpServer });
        }
    }
    #createWServer(newOptions = {}) {
        const opts = Object.assign({}, this.opts, newOptions);
        this._internal = new ws_1.Server(opts);
        this.attachTypesHandling();
    }
    defineUpgrade(fn) {
        if (this.customUpgradeDone) {
            throw new Error('Cannot redeclare again a custom upgrade.');
        }
        const newOptions = Object.assign({}, this.opts, { noServer: true });
        this.#createWServer(newOptions);
        this.#httpServer.on('upgrade', (request, socket, head) => {
            try {
                const response = fn(request);
                if (response instanceof Promise) {
                    response
                        .then((answer) => this.doUpgrade(answer, request, socket, head))
                        .catch((e) => this.rejectUpgrade(socket, e?.message, e));
                }
                else {
                    this.doUpgrade(response, request, socket, head);
                }
            }
            catch (e) {
                if (e instanceof Error) {
                    this.rejectUpgrade(socket, e?.message, e);
                }
            }
        });
        this.customUpgradeDone = true;
    }
    doUpgrade(answer, request, socket, head) {
        if (!answer.access)
            this.rejectUpgrade(socket, answer.message);
        else {
            this._internal.handleUpgrade(request, socket, head, (ws) => {
                const userClient = {
                    secId: request.headers['sec-websocket-key'] || generateId(),
                    ...(answer.client || {}),
                };
                ws.userClient = userClient;
                this._internal.emit('connection', ws, request, userClient);
            });
        }
    }
    rejectUpgrade(socket, message = 'Not Authorized', data) {
        logger_1.logMe.warn(message || `Upgrade rejected for the client from ${socket.remoteAddress}`, data);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); // TODO: enhance to be able to personalize this
        socket.destroy();
    }
    attachTypesHandling() {
        this._internal.on('connection', (ws, _, client) => {
            ws.onmessage = (event) => {
                const decode = (0, utils_1.JSONParse)(event.data);
                if (decode === null) {
                    logger_1.logMe.error('Incorrect data received from the client', {
                        data: event.data,
                        client: client ?? 'UNDEFINED_CLIENT',
                    });
                }
                else if (!decode.type) {
                    logger_1.logMe.error(`Data from the client does not contain 'type' field`, {
                        data: event.data,
                        client: client ?? 'UNDEFINED_CLIENT',
                    });
                }
                else {
                    const procedure = this.#types.get(decode.type);
                    if (!procedure || typeof procedure.handler !== 'function') {
                        logger_1.logMe.error(`There's no correct procedure for type "${decode.type}"`, {
                            data: event.data,
                            client: client ?? 'UNDEFINED_CLIENT',
                        });
                    }
                    else {
                        try {
                            const response = procedure.handler(decode, client, ws, event);
                            if (response instanceof Promise) {
                                response
                                    .then((resolvedResponse) => {
                                    if (!resolvedResponse)
                                        return;
                                    this.send({ ws, client }, (0, utils_1.JSONStringify)({ type: `${decode.type}_RESPONSE`, ...resolvedResponse }));
                                })
                                    .catch((e) => logger_1.logMe.error(`Error working out a handler for type ${decode.type}`, {
                                    error: e,
                                    client,
                                    data: decode,
                                }));
                            }
                            else {
                                if (!response)
                                    return;
                                this.send({ ws, client }, (0, utils_1.JSONStringify)({ type: `${decode.type}_RESPONSE`, ...response }));
                            }
                        }
                        catch (e) {
                            logger_1.logMe.error(`Error working out a handler for type ${decode.type}`, {
                                error: e,
                                client,
                                data: decode,
                            });
                        }
                    }
                }
            };
        });
    }
    send(ctx, data) {
        if (ctx.ws.readyState === ws_1.OPEN) {
            ctx.ws.send(data);
        }
        else {
            logger_1.logMe.error('Could not send data for the client', { client: ctx.client });
        }
    }
    declareReceiver(receiver) {
        const previousDeclaration = this.#types.get(receiver.type);
        if (previousDeclaration) {
            throw new Error(`Can not redeclare a type ${receiver.type} for the WS Server, already declared at ${previousDeclaration.loc}`);
        }
        if (typeof receiver.handler !== 'function') {
            throw new Error(`Can't declare a handler with type ${typeof receiver.handler}, should be a function with following signature: WsMessageHandler<T,?>`);
        }
        const place = (0, callsites_1.default)()[2];
        const loc = `${place.getFileName()}:${place.getLineNumber()}:${place.getColumnNumber()}`;
        this.#types.set(receiver.type, { loc, handler: receiver.handler });
    }
    getClientById(id) {
        for (const client of this._internal.clients.values()) {
            if (client.userClient.secId === id) {
                return client;
            }
        }
    }
    getClientByCriteria(criteria, value, criteriaFunction) {
        for (const client of this._internal.clients.values()) {
            if (typeof criteriaFunction === 'function') {
                if (criteriaFunction(client)) {
                    return client;
                }
            }
            if (client.userClient[criteria] === value) {
                return client;
            }
        }
    }
    handleManualConnect(fn) {
        this._internal.on('connection', (ws, _, client) => fn(ws, client));
    }
}
exports.WebSocketServer = WebSocketServer;
