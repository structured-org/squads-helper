import { Command } from 'commander';
import { registerWormholeEthereumCommand } from './commands/wormhole';
import {
  registerAddLiquidityCommand,
  registerBatchAddLiquidityCommand,
} from './commands/add_liquidity';
import { registerRemoveLiquidityCommand } from './commands/remove_liquidity';
import {
  registerActivateProposalCommand,
  registerExecuteProposalCommand,
  registerCreateProposalCommand,
  registerCheckProposalCommand,
  registerSimulateProposalCommand,
} from './commands/squads';
import { CommandValidator } from '@lib/validator';
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
import { Alt } from '@lib/alt';
import { MultisigProvider } from '@lib/multisig_provider';

const logger = getLogger();
const config = parseConfig(process.env.CONFIG_PATH);

const baseApp = getBaseApp();
const jupiterPerpsApp = getJupiterPerpsAppFromConfig(config);
const squadsMultisigApp = getSquadsMultisigAppFromConfig(config);
const wormholeApp = getWormholeAppfromConfig(config);

const commandValidator = new CommandValidator(logger, jupiterPerpsApp);

const jupiterPerps = new JupiterPerps(logger, baseApp, jupiterPerpsApp);
const squadsMultisig = new SquadsMultisig(logger, baseApp, squadsMultisigApp);
const alt = new Alt(logger, baseApp);
const wormholeEthereum = new WormholeEthereum(logger, baseApp, wormholeApp);
const multisigProvider = new MultisigProvider(
  logger,
  jupiterPerps,
  squadsMultisig,
  baseApp,
  wormholeEthereum,
);

const program = new Command();

program
  .name('squads-helper')
  .description('CLI to operate a SQUADS multisig with different messages')
  .version('1.1.0');

registerActivateProposalCommand(program, logger, baseApp, squadsMultisig);
registerCreateProposalCommand(program, logger, baseApp, squadsMultisig);
registerCheckProposalCommand(program, logger, baseApp, squadsMultisig);
registerExecuteProposalCommand(program, logger, baseApp, squadsMultisig);
registerSimulateProposalCommand(program, baseApp, squadsMultisig);
registerBatchAddLiquidityCommand(
  alt,
  program,
  logger,
  baseApp,
  jupiterPerps,
  squadsMultisig,
  commandValidator,
);
registerAddLiquidityCommand(
  alt,
  program,
  logger,
  baseApp,
  jupiterPerps,
  multisigProvider,
  commandValidator,
);
registerRemoveLiquidityCommand(
  alt,
  program,
  logger,
  baseApp,
  jupiterPerps,
  multisigProvider,
  commandValidator,
);
registerWormholeEthereumCommand(
  alt,
  program,
  logger,
  baseApp,
  wormholeEthereum,
  multisigProvider,
);

function main() {
  program.parse();
}

main();
