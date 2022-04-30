"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envs = void 0;
exports.envs = {
    isProd: process.env.NODE_ENV === 'production',
    isDev: process.env.NODE_ENV === 'development',
    isTest: process.env.NODE_ENV === 'test',
};
