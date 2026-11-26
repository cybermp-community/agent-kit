/** Library entry: talk to the game bridge from your own scripts */
export {
  BridgeError,
  type BridgeMethod,
  callBridge,
  describeBridge,
} from './live/bridge.js';
export { readEnv } from './live/env.js';
