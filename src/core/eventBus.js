// src/core/eventBus.js
// Central lightweight event backbone for in-process messaging

const EventEmitter = require('events');

class CoreEventBus extends EventEmitter {
  constructor() {
    super();
    // Increase listener count capacity if needed for multiple services
    this.setMaxListeners(30);
  }
}

module.exports = new CoreEventBus();
