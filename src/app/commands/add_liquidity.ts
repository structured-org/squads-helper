import { Command } from 'commander';
import { JupiterPerps } from '@lib/jlp';
import { simulateAndBroadcast } from '@lib/helpers';
import { MultisigProvider } from '@lib/multisig_provider';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';
import { SquadsMultisig } from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import { Alt, createJupiterPerpsAltTableIfNotExist } from '@lib/alt';
import { CommandValidator } from '@lib/validator';

export function registerBatchAddLiquidityCommand(
  alt: Alt,
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  jupiterPerps: JupiterPerps,
  squadsMultisig: SquadsMultisig,
  commandValidator: CommandValidator,
) {
  program
    .command('batch-add-liquidity')
    .description(
      'Adds an instruction for adding liquidity to the existing multisig batch',
    )
    .requiredOption(
      '--amount <amount>',
      'Amount of tokens we have to provide (e.g. --amount 123USDC)',
    )
    .requiredOption(
      '--slippage-tolerance <slippage_tolerance>',
      'Slippage tolerance for JLP tokens (e.g. --slippage-tolerance 0.5)',
    )
    .requiredOption(
      '--proposal-index <index>',
      'Proposal index where to add given instruction. Proposal should exist but should not be activated yet',
    )
    .action(async (options) => {
      await createJupiterPerpsAltTableIfNotExist(alt, jupiterPerps.app);
      const coin = commandValidator.validateAmount(options.amount);
      const batch = await squadsMultisig.getBatch(options.proposalIndex!);

      logger.info(`Provide Liquidity Amount -- ${options.amount}`);
      logger.info(
        `Provide Liquidity Slippage Tolerance -- ${options.slippageTolerance}`,
      );
      logger.info(`Batch Transaction Index -- ${batch.size + 1}`);
      const addLiquidityIx = await jupiterPerps.relativeAddLiquidityIx(
        squadsMultisig.app.vaultPda,
        coin,
        Number(options.slippageTolerance),
      );
      const altData = (
        await baseApp.anchorProvider.connection.getAddressLookupTable(
          new web3.PublicKey(jupiterPerps.app.altTable!),
        )
      ).value;
      const batchAddLiquidityIx = await squadsMultisig.batchAddByIndexIxV0(
        options.proposalIndex!,
        batch.size + 1,
        addLiquidityIx,
        altData,
      );
      const tx = new web3.Transaction().add(batchAddLiquidityIx);
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        tx,
        'add liquidity provision instruction into the batch',
        logger,
        baseApp.keypair,
      );
    });
}

export function registerAddLiquidityCommand(
  alt: Alt,
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  jupiterPerps: JupiterPerps,
  multisigProvider: MultisigProvider,
  commandValidator: CommandValidator,
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
      await createJupiterPerpsAltTableIfNotExist(alt, jupiterPerps.app);
      const coin = commandValidator.validateAmount(options.amount);

      logger.info(`Provide Liquidity Amount -- ${options.amount}`);
      logger.info(
        `Provide Liquidity Slippage Tolerance -- ${options.slippageTolerance}`,
      );
      const tx = await multisigProvider.createAddLiquidityProposalTx(
        Number(options.slippageTolerance),
        coin,
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
