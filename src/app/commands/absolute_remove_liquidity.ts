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

export function registerAbsoluteRemoveLiquidityCommand(program: Command) {
  program
    .command('absolute-remove-liquidity')
    .description(
      'Creates a proposal with JupiterPerps execution message addLiquidity2',
    )
    .requiredOption(
      '--amount <amount>',
      'Amount of tokens we have to provide (e.g. --amount 123USDC)',
    )
    .requiredOption(
      '--min-amount-token-out <min_amount_token_out>',
      'Minimum --denom-out amount out from the given JLP (e.g. --min-amount-token-out 100USDC)',
    )
    .action(async (options) => {
      logger.debug('Reading the config');
      const [, amountIn, denomIn] = options.amount.match(
        /^(\d+(?:\.\d+)?)([A-Z]+)$/,
      );
      if (denomIn !== JLP_DENOM) {
        logger.error(`--amount: Given coin should has JLP denom -- ${denomIn}`);
        process.exit(-1);
      }
      const [, amountOut, denomOut] = options.minAmountTokenOut.match(
        /^(\d+(?:\.\d+)?)([A-Z]+)$/,
      );
      if (jupiterPerps.app.coins.get(denomOut) === undefined) {
        logger.error(
          `--min-amount-token-out: Given denom doesn't exist for the given config -- ${denomOut}`,
        );
        process.exit(-1);
      }
      if (Number(amountOut) % 1 !== 0) {
        logger.error(`--min-amount-token-out: It's supposed to be an integer`);
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

      logger.info(`Absolute Remove Liquidity Denom Out -- ${options.denomOut}`);
      logger.info(
        `Absolute Remove Liquidity Token Amount -- ${options.amount}`,
      );
      logger.info(
        `Absolute Remove Liquidity MinAmountTokenOut -- ${options.minAmountTokenOut}`,
      );
      const tx = await multisigProvider.createRemoveLiquidityAbsoluteProposalTx(
        Number(amountOut),
        denomOut,
        {
          denom: denomIn,
          amount: bignumber(amountIn),
          precision: JLP_PRECISION,
        },
      );
      //   await simulateAndBroadcast(
      //     baseApp.anchorProvider,
      //     tx,
      //     'absolute liquidity removal propopsal',
      //     logger,
      //     baseApp.keypair,
      //   );
    });
}
