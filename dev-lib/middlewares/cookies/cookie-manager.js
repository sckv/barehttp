"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookiesManager = void 0;
const cookie_1 = __importDefault(require("cookie"));
const signer_1 = require("./signer");
const logger_1 = require("../../logger");
class CookiesManager {
    options;
    flow;
    signer;
    constructor(options = {}, flow) {
        this.options = options;
        this.flow = flow;
        const secret = this.options.secret || '';
        const enableRotation = Array.isArray(secret);
        this.signer = typeof secret === 'string' || enableRotation ? (0, signer_1.secretsOperator)(secret) : null;
    }
    setCookie(name, value, options, signer) {
        const localSigner = signer || this.signer;
        const opts = options || this.options;
        if (opts.expires && Number.isInteger(opts.expires)) {
            opts.expires = new Date(opts.expires);
        }
        if (opts.signed && localSigner) {
            value = localSigner.sign(value);
        }
        const serialized = cookie_1.default.serialize(name, value, opts);
        let setCookie = this.flow.getHeader('Set-Cookie');
        if (!setCookie) {
            this.flow.setHeader('Set-Cookie', serialized);
            return;
        }
        if (typeof setCookie === 'string') {
            setCookie = [setCookie];
        }
        setCookie.push(serialized);
        this.flow.setHeader('Set-Cookie', setCookie);
    }
    clearCookie(name, options = {}) {
        const opts = {
            path: '/',
            ...options,
            expires: new Date(1),
            signed: undefined,
            maxAge: undefined,
        };
        return this.setCookie(name, '', opts);
    }
    parseCookie(rawCookie) {
        if (!rawCookie)
            return {};
        const result = {};
        const values = rawCookie?.split(';');
        for (let i = 0; i < values.length - 1; i++) {
            const split = values[i].trim().split('=');
            if (split.length == 2)
                result[split[0]] = split[1];
        }
        return result;
    }
    unsignCookie(value) {
        if (!this.signer) {
            logger_1.logMe.error('No signer defined for the cookies, unsign wont work');
            return;
        }
        return this.signer.unsign(value);
    }
}
exports.CookiesManager = CookiesManager;
