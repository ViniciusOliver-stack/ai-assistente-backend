import { EventEmitter } from 'events';

class GlobalEventEmitter extends EventEmitter {}
export const globalEventEmitter = new GlobalEventEmitter();