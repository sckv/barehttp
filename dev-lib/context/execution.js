"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Execution = void 0;
const hyperid_1 = __importDefault(require("hyperid"));
const generateId = (0, hyperid_1.default)();
class Execution {
    id;
    type;
    store;
    headers;
    constructor(type) {
        this.id = generateId();
        this.type = type;
        this.store = new Map();
        this.headers = new Map();
    }
}
exports.Execution = Execution;
