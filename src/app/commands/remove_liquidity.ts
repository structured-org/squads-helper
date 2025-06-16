import { Command } from 'commander';
import { MultisigProvider } from '@lib/multisig_provider';
import { simulateAndBroadcast } from '@lib/helpers';
import { Logger } from 'pino';
import { BaseApp } from '@config/config';
import { Alt, createJupiterPerpsAltTableIfNotExist } from '@lib/alt';
import { CommandValidator } from '@lib/validator';

export function registerRemoveLiquidityCommand(
  alt: Alt,
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  jupiterPerps: JupiterPerps,
  multisigProvider: MultisigProvider,
  commandValidator: CommandValidator,
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
      await createJupiterPerpsAltTableIfNotExist(alt, jupiterPerps.app);
      const coin = commandValidator.validateJlpAmount(
        options.amount,
        options.denomOut,
      );

      logger.info(`Remove Liquidity Denom Out ${options.denomOut}`);
      logger.info(`Remove Liquidity Token Amount ${options.amount}`);
      logger.info(
        `Remove Liquidity Slippage Tolerance ${options.slippageTolerance}`,
      );
      const tx = await multisigProvider.createRemoveLiquidityProposalTx(
        Number(options.slippageTolerance),
        options.denomOut,
        coin,
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
