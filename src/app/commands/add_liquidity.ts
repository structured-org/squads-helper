import { Command } from 'commander';
import { JupiterPerps } from '@lib/jlp';
import { simulateAndBroadcast } from '@lib/helpers';
import { MultisigProvider } from '@lib/multisig_provider';
import { bignumber } from 'mathjs';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';
import { SquadsMultisig } from '@lib/squads';
import { web3 } from '@project-serum/anchor';

export function registerBatchAddLiquidityCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  jupiterPerps: JupiterPerps,
  squadsMultisig: SquadsMultisig,
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
    .requiredOption(
      '--instruction-index <index>',
      'Every instruction should have the index, starting with 1',
    )
    .action(async (options) => {
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
      const addLiquidityIx = await jupiterPerps.relativeAddLiquidityIx(
        squadsMultisig.app.vaultPda,
        {
          denom: denom,
          amount: amount,
          precision: jupiterPerps.app.coins.get(denom)!.decimals,
        },
        Number(options.slippageTolerance),
      );
      const altData = (
        await baseApp.anchorProvider.connection.getAddressLookupTable(
          new web3.PublicKey(jupiterPerps.app.altTable!),
        )
      ).value;
      const batchAddLiquidityIx = await squadsMultisig.batchAddByIndexIxV0(
        options.proposalIndex!,
        options.instructionIndex!,
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
