import { Command } from 'commander';
import { JupiterPerps } from '@lib/jlp';
import { simulateAndBroadcast } from '@lib/helpers';
import { MultisigProvider } from '@lib/multisig_provider';
import { bignumber } from 'mathjs';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';

export function registerAddLiquidityCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  jupiterPerps: JupiterPerps,
  multisigProvider: MultisigProvider,
) {
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
