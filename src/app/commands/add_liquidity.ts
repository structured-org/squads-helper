import { Command } from 'commander';

import {
  getBaseApp,
  parseConfig,
  getJupiterPerpsAppFromConfig,
  getSquadsMultisigAppFromConfig,
} from '@config/config';
import { SquadsMultisig } from '@lib/squads';
import { Alt } from '@lib/alt';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { JupiterPerps } from '@lib/jlp';
import { simulateAndBroadcast } from '@lib/helpers';
import { MultisigProvider } from '@lib/multisig_provider';
import { bignumber } from 'mathjs';

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

export function registerAddLiquidityCommand(program: Command) {
  program
    .command('add-liquidity')
    .description(
      'Creates a proposal with JupiterPerps execution message addLiquidity2',
    )
    .requiredOption(
      '--amount <amount>',
      'Amount of tokens we have to provide (e.g. --amount 123USDC)',
    )
    .requiredOption(
      '--slippage-tolerance <slippage_tolerance>',
      'Slippage tolerance for JLP tokens (e.g. --slippage-tolerance 0.5)',
    )
    .action(async (options) => {
      logger.debug('Reading the config');
      const [, amount, denom] = options.amount.match(
        /^(\d+(?:\.\d+)?)([A-Z]+)$/,
      );
      if (jupiterPerps.app.coins.get(denom) === undefined) {
        logger.error(
          `--amount: No such a coin described in the config -- ${denom}`,
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
      logger.info(`Provide Liquidity Amount -- ${options.amount}`);
      logger.info(
        `Provide Liquidity Slippage Tolerance -- ${options.slippageTolerance}`,
      );
      const tx = await multisigProvider.createAddLiquidityProposalTx(
        Number(options.slippageTolerance),
        {
          denom: denom,
          amount: bignumber(amount),
          precision: jupiterPerps.app.coins.get(denom)!.decimals,
        },
      );
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        tx,
        'liquidity provision propopsal',
        logger,
        baseApp.keypair,
      );
    });
}
