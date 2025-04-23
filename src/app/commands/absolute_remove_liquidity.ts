import { Command } from 'commander';
import { Logger } from 'pino';
import { bignumber } from 'mathjs';
import { JLP_DENOM, JLP_PRECISION, JupiterPerps } from '@lib/jlp';
import { MultisigProvider } from '@lib/multisig_provider';
import { simulateAndBroadcast } from '@lib/helpers';
import { BaseApp } from '@config/config';

export function registerAbsoluteRemoveLiquidityCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  jupiterPerps: JupiterPerps,
  multisigProvider: MultisigProvider,
) {
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
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        tx,
        'absolute liquidity removal propopsal',
        logger,
        baseApp.keypair,
      );
    });
}
