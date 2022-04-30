"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logMe = exports.logHttp = void 0;
const pino_1 = __importStar(require("pino"));
const serializers_1 = require("./serializers");
const env_1 = require("../env");
const asyncDest = env_1.envs.isProd ? [(0, pino_1.destination)({ sync: false })] : [];
const pinoCommonOptions = {
    timestamp: () => `,"time":"${new Date()[env_1.envs.isProd ? 'toISOString' : 'toLocaleTimeString']()}"`,
    formatters: {
        level: (label) => ({ level: label }),
    },
    messageKey: 'message',
    prettyPrint: !env_1.envs.isProd,
};
const logger = (0, pino_1.default)(pinoCommonOptions, asyncDest[0]);
if (env_1.envs.isProd) {
    setInterval(function () {
        logger.flush();
    }, 10000).unref();
    const handler = pino_1.default.final(logger, (err, finalLogger, evt) => {
        finalLogger.info(`${evt} caught`);
        if (err)
            finalLogger.error(err, 'error caused exit');
        process.exit(err ? 1 : 0);
    });
    // catch all the ways node might exit
    process.on('beforeExit', () => handler(null, 'beforeExit'));
    process.on('exit', () => handler(null, 'exit'));
    process.on('uncaughtException', (err) => handler(err, 'uncaughtException'));
    process.on('SIGINT', () => handler(null, 'SIGINT'));
    process.on('SIGQUIT', () => handler(null, 'SIGQUIT'));
    process.on('SIGTERM', () => handler(null, 'SIGTERM'));
}
const logHttp = (...params) => {
    const { level, logObject } = (0, serializers_1.serializeHttp)(...params);
    logger[level](logObject);
};
exports.logHttp = logHttp;
// TODO: remove the test condition
exports.logMe = {
    debug: (...args) => !env_1.envs.isTest && logger.debug((0, serializers_1.serializeLog)(...args)),
    info: (...args) => !env_1.envs.isTest && logger.info((0, serializers_1.serializeLog)(...args)),
    warn: (...args) => !env_1.envs.isTest && logger.warn((0, serializers_1.serializeLog)(...args)),
    error: (...args) => !env_1.envs.isTest && logger.error((0, serializers_1.serializeLog)(...args)),
    fatal: (...args) => !env_1.envs.isTest && logger.fatal((0, serializers_1.serializeLog)(...args)),
    trace: (...args) => !env_1.envs.isTest && logger.trace((0, serializers_1.serializeLog)(...args)),
};
