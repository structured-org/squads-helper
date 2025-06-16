import { Logger } from 'pino';
import { JupiterPerpsApp } from '@config/config';
import { Coin } from '@lib/coin';
import { bignumber } from 'mathjs';

export class CommandValidator {
  logger: Logger;
  jupiterPerpsApp: JupiterPerpsApp;

  constructor(logger: Logger, jupiterPerpsApp: JupiterPerpsApp) {
    this.logger = logger;
    this.jupiterPerpsApp = jupiterPerpsApp;
  }

  validateAmount(inputAsset: string): Coin {
    const [, amount, denom] = inputAsset.match(/^(\d+(?:\.\d+)?)([A-Z]+)$/);
    if (this.jupiterPerpsApp.coins.get(denom) === undefined) {
      this.logger.error(
        `--amount: No such a coin described in the config -- ${denom}`,
      );
      process.exit(-1);
    }
    return {
      denom: denom,
      amount: bignumber(amount),
      precision: this.jupiterPerpsApp.coins.get(denom)!.decimals,
    };
  }
}