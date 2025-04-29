import { Command } from 'commander';
import { registerAddLiquidityCommand } from './commands/add_liquidity';
import { registerRemoveLiquidityCommand } from './commands/remove_liquidity';
import { registerAbsoluteAddLiquidityCommand } from './commands/absolte_add_liquidity';
import { registerAbsoluteRemoveLiquidityCommand } from './commands/absolute_remove_liquidity';

import {
  getBaseApp,
  parseConfig,
  getJupiterPerpsAppFromConfig,
  getSquadsMultisigAppFromConfig,
  getWormholeAppfromConfig,
} from '@config/config';
import { SquadsMultisig } from '@lib/squads';
import { getLogger } from '@lib/logger';
import { JupiterPerps } from '@lib/jlp';
import { WormholeEthereum } from '@lib/wormhole';
import {
  Alt,
  createJupiterPerpsAltTableIfNotExist,
  createWormholeAltTablesIfNotExist,
} from '@lib/alt';
import { MultisigProvider } from '@lib/multisig_provider';

const logger = getLogger();
const config = parseConfig(process.env.CONFIG_PATH);

const baseApp = getBaseApp();
const jupiterPerpsApp = getJupiterPerpsAppFromConfig(config);
const squadsMultisigApp = getSquadsMultisigAppFromConfig(config);
const wormholeApp = getWormholeAppfromConfig(config);

const jupiterPerps = new JupiterPerps(logger, baseApp, jupiterPerpsApp);
const squadsMultisig = new SquadsMultisig(logger, baseApp, squadsMultisigApp);
const alt = new Alt(logger, baseApp);
const wormholeEthereum = new WormholeEthereum(logger, baseApp, wormholeApp);
const multisigProvider = new MultisigProvider(
  logger,
  jupiterPerps,
  squadsMultisig,
  baseApp,
);

const program = new Command();

program
  .name('squads-helper')
  .description('CLI to operate a SQUADS multisig with different messages')
  .version('1.1.0');

registerAddLiquidityCommand(
  program,
  logger,
  baseApp,
  jupiterPerps,
  multisigProvider,
);
registerRemoveLiquidityCommand(
  program,
  logger,
  baseApp,
  jupiterPerps,
  multisigProvider,
);
registerAbsoluteAddLiquidityCommand(
  program,
  logger,
  baseApp,
  jupiterPerps,
  multisigProvider,
);
registerAbsoluteRemoveLiquidityCommand(
  program,
  logger,
  baseApp,
  jupiterPerps,
  multisigProvider,
);

async function main() {
  await createJupiterPerpsAltTableIfNotExist(alt, jupiterPerpsApp);
  await createWormholeAltTablesIfNotExist(alt, wormholeApp);

  program.parse();
}

main();
