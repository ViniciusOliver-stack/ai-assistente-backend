"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalEventEmitter = void 0;
const events_1 = require("events");
class GlobalEventEmitter extends events_1.EventEmitter {
}
exports.globalEventEmitter = new GlobalEventEmitter();
