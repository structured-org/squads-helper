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
} from '@config/config';
import { SquadsMultisig } from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { JupiterPerps } from '@lib/jlp';
import { Alt } from '@lib/alt';
import { MultisigProvider } from '@lib/multisig_provider';
import { simulateAndBroadcast } from '@lib/helpers';

const logger = getLogger();
const config = parseConfig(process.env.CONFIG_PATH);
const baseApp = getBaseApp();
const jupiterPerpsApp = getJupiterPerpsAppFromConfig(config);
const squadsMultisigApp = getSquadsMultisigAppFromConfig(config);
const jupiterPerps = new JupiterPerps(logger, baseApp, jupiterPerpsApp);
const squadsMultisig = new SquadsMultisig(logger, baseApp, squadsMultisigApp);
const alt = new Alt(logger, baseApp);
const multisigProvider = new MultisigProvider(
  logger,
  jupiterPerps,
  squadsMultisig,
  baseApp,
);

const program = new Command();

program
  .name('squads-jlp-helper')
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
  if (jupiterPerps.app.altTable === undefined) {
    const createTable = await alt.createTable(jupiterPerps.app.accounts);
    jupiterPerps.app.altTable = new web3.PublicKey(
      createTable.lookupTableAddress.toBase58(),
    );
    await simulateAndBroadcast(
      baseApp.anchorProvider,
      createTable.tx,
      'table creation',
      logger,
      baseApp.keypair,
    );
  } else {
    logger.info(`ALT Table Defined -- ${jupiterPerps.app.altTable!}`);
    const lookupTableAccount = (
      await baseApp.anchorProvider.connection.getAddressLookupTable(
        new web3.PublicKey(jupiterPerps.app.altTable!),
      )
    ).value;
    for (let i = 1; i <= lookupTableAccount.state.addresses.length; i += 1) {
      logger.info(
        `ALT Account ${i}/${lookupTableAccount.state.addresses.length} -- ${lookupTableAccount.state.addresses[i - 1]}`,
      );
    }
  }

  program.parse();
}

main();
