import { Command } from 'commander';

import {
  getBaseApp,
  parseConfig,
  getJupiterPerpsAppFromConfig,
  getSquadsMultisigAppFromConfig,
} from '@config/config';
import { SquadsMultisig } from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { bignumber } from 'mathjs';
import { JLP_DENOM, JLP_PRECISION, JupiterPerps } from '@lib/jlp';
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

export function registerRemoveLiquidityCommand(program: Command) {
  program
    .command('remove-liquidity')
    .description(
      'Creates a proposal with JupiterPerps execution message removeLiquidity2',
    )
    .requiredOption(
      '--amount <amount>',
      'Amount of tokens we have to provide (e.g. --amount 123JLP)',
    )
    .requiredOption(
      '--slippage-tolerance <slippage_tolerance>',
      'Slippage tolerance for JLP tokens (e.g. --slippage-tolerance 0.5)',
    )
    .requiredOption(
      '--denom-out <denom>',
      'What you prefer to withdraw in exchange (e.g. --denom-out USDC)',
    )
    .action(async (options) => {
      logger.debug('Reading the config');
      const [, amount, denom] = options.amount.match(
        /^(\d+(?:\.\d+)?)([A-Z]+)$/,
      );
      if (denom !== JLP_DENOM) {
        logger.error(`--amount: Amount should has a JLP denom -- ${denom}`);
        process.exit(-1);
      }
      if (jupiterPerps.app.coins.get(options.denomOut) === undefined) {
        logger.error(
          `--denom-out: Given denom doesn't exist for the given config -- ${options.denomOut}`,
        );
        process.exit(-1);
      }

      // We need to have ALT for further addLiquidity2 instruction contraction
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
        for (
          let i = 1;
          i <= lookupTableAccount.state.addresses.length;
          i += 1
        ) {
          logger.info(
            `ALT Account ${i}/${lookupTableAccount.state.addresses.length} -- ${lookupTableAccount.state.addresses[i - 1]}`,
          );
        }
      }

      logger.info(`Remove Liquidity Denom Out ${options.denomOut}`);
      logger.info(`Remove Liquidity Token Amount ${options.amount}`);
      logger.info(
        `Remove Liquidity Slippage Tolerance ${options.slippageTolerance}`,
      );
      const tx = await multisigProvider.createRemoveLiquidityProposalTx(
        Number(options.slippageTolerance),
        options.denomOut,
        {
          denom: denom,
          amount: bignumber(amount),
          precision: JLP_PRECISION,
        },
      );
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        tx,
        'liquidity removal propopsal',
        logger,
        baseApp.keypair,
      );
    });
}
