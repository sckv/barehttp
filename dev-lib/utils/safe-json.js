"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSONParse = exports.JSONStringify = void 0;
const JSONStringify = (data) => {
    try {
        return JSON.stringify(data);
    }
    catch (e) {
        console.log('Error stringifying, data not serializable', e);
        return null;
    }
};
exports.JSONStringify = JSONStringify;
const JSONParse = (data) => {
    try {
        return JSON.parse(data);
    }
    catch (e) {
        console.log('Error parsing, data not deserializable', e);
        return e;
    }
};
exports.JSONParse = JSONParse;
