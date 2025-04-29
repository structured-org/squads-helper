import type { BaseApp, WormholeApp } from '@config/config';
import { Logger } from 'pino';

export class Wormhole {
  private logger: Logger;
  private baseApp: BaseApp;
  private wormholeApp: WormholeApp;

  constructor(logger: Logger, baseApp: BaseApp, wormholeApp: WormholeApp) {
    this.logger = logger;
    this.baseApp = baseApp;
    this.wormholeApp = wormholeApp;
  }

  get app(): WormholeApp {
    return this.wormholeApp;
  }
}
