// testUtils/fakeSocket.ts
//
// A minimal socket.io-client Socket stub built on Node's EventEmitter.
// socket.io's Socket exposes .on(), .off(), and .emit() — that is the full
// surface our hooks consume.  We do NOT import socket.io-client here, so
// this runs in any jsdom / Node environment without bundler concerns.
//
// Usage:
//   const { socket, serverEmit } = makeFakeSocket();
//   // socket  → pass to the hook as if it were a real Socket
//   // serverEmit(event, data) → simulate the server sending an event

import { EventEmitter } from "events";

export interface FakeSocket {
  /** Pass this to hooks as the `socket` prop */
  socket: SocketLike;
  /**
   * Simulate the SERVER emitting an event to this client.
   * Calls all listeners registered with socket.on(event, ...).
   */
  serverEmit: (event: string, ...args: unknown[]) => void;
  /**
   * Spy on events emitted FROM the client (i.e., socket.emit() calls).
   * Returns all [event, ...args] tuples the client has emitted so far.
   */
  clientEmissions: () => Array<[string, ...unknown[]]>;
  /** Reset emission history */
  clearEmissions: () => void;
}

/**
 * Minimal interface matching what our hooks call on socket.io's Socket.
 * Keeps TypeScript happy without importing socket.io-client.
 */
export interface SocketLike {
  on(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
  connected: boolean;
  id: string;
  hasListeners?: (event: string) => boolean;
}

export function makeFakeSocket(connected = true): FakeSocket {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50); // suppress Node warning in tests with many listeners

  const emissions: Array<[string, ...unknown[]]> = [];

  const socket: SocketLike = {
    connected,
    id: `fake-socket-${Math.random().toString(36).slice(2, 8)}`,

    on(event: string, listener: (...args: any[]) => void) {
      emitter.on(event, listener);
      return this;
    },

    off(event: string, listener: (...args: any[]) => void) {
      emitter.off(event, listener);
      return this;
    },

    emit(event: string, ...args: any[]): boolean {
      // Record client-side emissions for assertion
      emissions.push([event, ...args]);
      return true;
    },

    hasListeners(event: string): boolean {
      return emitter.listenerCount(event) > 0;
    },
  };

  return {
    socket,
    serverEmit(event: string, ...args: unknown[]) {
      emitter.emit(event, ...args);
    },
    clientEmissions() {
      return [...emissions];
    },
    clearEmissions() {
      emissions.length = 0;
    },
  };
}