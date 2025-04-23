import { Command } from 'commander';
import { bignumber } from 'mathjs';
import { JupiterPerps } from '@lib/jlp';
import { MultisigProvider } from '@lib/multisig_provider';
import { simulateAndBroadcast } from '@lib/helpers';
import { Logger } from 'pino';
import { BaseApp } from '@config/config';

export function registerAbsoluteAddLiquidityCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  jupiterPerps: JupiterPerps,
  multisigProvider: MultisigProvider,
) {
  program
    .command('absolute-add-liquidity')
    .description(
      'Creates a proposal with JupiterPerps execution message addLiquidity2',
    )
    .requiredOption(
      '--amount <amount>',
      'Amount of tokens we have to provide (e.g. --amount 123USDC)',
    )
    .requiredOption(
      '--min-lp-amount-out <min_lp_amount_out>',
      'Minimum JLP amount out from provided liquidity (e.g. --min-lp-amount-out 100)',
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
      if (Number(options.minLpAmountOut) % 1 !== 0) {
        logger.error(`'--min-lp-amount-out: It's supposed to be an integer`);
        process.exit(-1);
      }

      logger.info(`Absolute Provide Liquidity Token Amount ${options.amount}`);
      logger.info(
        `Absolute Provide Liquidity MinLpAmountOut ${options.minLpAmountOut}`,
      );
      const tx = await multisigProvider.createAddLiquidityAbsoluteProposalTx(
        Number(options.minLpAmountOut),
        {
          denom: denom,
          amount: bignumber(amount),
          precision: jupiterPerps.app.coins.get(denom)!.decimals,
        },
      );
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        tx,
        'absolute liquidity provision propopsal',
        logger,
        baseApp.keypair,
      );
    });
}
