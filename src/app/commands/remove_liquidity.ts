import { Command } from 'commander';
import { bignumber } from 'mathjs';
import { JLP_DENOM, JLP_PRECISION, JupiterPerps } from '@lib/jlp';
import { MultisigProvider } from '@lib/multisig_provider';
import { simulateAndBroadcast } from '@lib/helpers';
import { Logger } from 'pino';
import { BaseApp } from '@config/config';

export function registerRemoveLiquidityCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  jupiterPerps: JupiterPerps,
  multisigProvider: MultisigProvider,
) {
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
