"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.secretsOperator = void 0;
const cookie_signature_1 = __importDefault(require("cookie-signature"));
function secretsOperator(secret) {
    const secrets = Array.isArray(secret) ? secret : [secret];
    const [signingKey] = secrets;
    return {
        sign(value) {
            return cookie_signature_1.default.sign(value, signingKey);
        },
        unsign(signedValue) {
            let valid = false;
            let renew = false;
            let value = null;
            for (const key of secrets) {
                const result = cookie_signature_1.default.unsign(signedValue, key);
                if (result !== false) {
                    valid = true;
                    renew = key !== signingKey;
                    value = result;
                    break;
                }
            }
            return { valid, renew, value };
        },
    };
}
exports.secretsOperator = secretsOperator;
