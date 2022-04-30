"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enableContext = exports.newContext = exports.context = void 0;
const execution_1 = require("./execution");
const async_hooks_1 = __importDefault(require("async_hooks"));
const running = new Map();
const previous = new Map();
const newContext = (type) => {
    if (!context.enabled)
        return;
    context.current = new execution_1.Execution(type);
    running.set(async_hooks_1.default.executionAsyncId(), context.current);
};
exports.newContext = newContext;
const context = {
    enabled: false,
};
exports.context = context;
function init(asyncId, _type, triggerAsyncId) {
    if (running.get(triggerAsyncId)) {
        running.set(asyncId, running.get(triggerAsyncId));
    }
}
function before(asyncId) {
    if (!running.get(asyncId))
        return;
    previous.set(asyncId, context.current);
    context.current = running.get(asyncId);
}
function after(asyncId) {
    if (!running.get(asyncId))
        return;
    context.current = previous.get(asyncId);
}
function destroy(asyncId) {
    if (running.get(asyncId)) {
        running.delete(asyncId);
        previous.delete(asyncId);
    }
}
const hook = async_hooks_1.default.createHook({
    init,
    before,
    after,
    destroy,
});
const enableContext = () => {
    context.enabled = true;
    return hook.enable();
};
exports.enableContext = enableContext;
