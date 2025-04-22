import { Config } from '@config/config';
import { Alt } from '@lib/alt';
import { Jupiter } from '@lib/jlp';
import { Squads } from '@lib/squads';
import { Logger } from 'pino';

export class MultisigProvider {
  private logger: Logger;
  private config: Config;
  private jupiter: Jupiter;
  private squads: Squads;
  private alt: Alt;

  constructor(
    logger: Logger,
    config: Config,
    jupiter: Jupiter,
    squads: Squads,
    alt: Alt,
  ) {
    this.logger = logger;
    this.config = config;
    this.jupiter = jupiter;
    this.squads = squads;
    this.alt = alt;
  }
}
