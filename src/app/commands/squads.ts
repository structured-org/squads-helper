import { Command } from 'commander';
import {
  simulateAndBroadcast,
  simulateAndBroadcastVersionedTx,
} from '@lib/helpers';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';
import { Batch, SquadsMultisig, VaultTransaction } from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import {
  AddLiquidity2Discriminator,
  AddLiquidity2Params,
  JupiterPerps,
  RemoveLiquidity2Discriminator,
  RemoveLiquidity2Params,
} from '@lib/jlp';
import {
  getBatchTransactionPda,
  getProposalPda,
  getTransactionPda,
} from '@sqds/multisig';
import * as treeify from 'treeify';

BigInt.prototype['toJSON'] = function () {
  return this.toString();
};

export function registerCreateProposalCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  squadsMultisig: SquadsMultisig,
) {
  program
    .command('create-proposal')
    .description('Creates an empty proposal (proposal + empty batch)')
    .action(async () => {
      const createProposalIx = await squadsMultisig.createProposalIx();
      const createBatchIx = await squadsMultisig.createBatchIx();
      const tx = new web3.Transaction().add(createBatchIx, createProposalIx);
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        tx,
        'proposal & batch creation',
        logger,
        baseApp.keypair,
      );
    });
}

export function registerActivateProposalCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  squadsMultisig: SquadsMultisig,
) {
  program
    .command('activate-proposal')
    .description(
      'Activates the proposal (new instructions into batch are no longer accepted)',
    )
    .requiredOption(
      '--proposal-index <index>',
      'What proposal you wish to activate. This values can be usually taken from the logs of create-proposal',
    )
    .action(async (options) => {
      const activateProposalIx = squadsMultisig.proposalActivateByIndexIx(
        options.proposalIndex!,
      );
      const tx = new web3.Transaction().add(activateProposalIx);
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        tx,
        'proposal activation',
        logger,
        baseApp.keypair,
      );
    });
}

export function registerExecuteProposalCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  squadsMultisig: SquadsMultisig,
  jupiterPerps: JupiterPerps,
) {
  program
    .command('execute-proposal')
    .description('Execute all the instructions inside of the batch')
    .requiredOption(
      '--proposal-index <index>',
      'What proposal you wish to execute. This values can be usually taken from the logs of create-proposal',
    )
    .requiredOption(
      '--instructions-count <index>',
      'Amount of instructions inside of the batch we need to execute in a row',
    )
    .action(async (options) => {
      const executeProposalMsg = await squadsMultisig.proposalExecuteMsgV0(
        options.proposalIndex!,
        options.instructionsCount!,
        (
          await baseApp.anchorProvider.connection.getAddressLookupTable(
            jupiterPerps.app.altTable!,
          )
        ).value,
      );
      const tx = new web3.VersionedTransaction(executeProposalMsg);
      tx.sign([baseApp.keypair]);

      await simulateAndBroadcastVersionedTx(
        baseApp.anchorProvider,
        tx,
        'proposal execution',
        logger,
      );
    });
}

export function registerCheckProposalCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  squadsMultisig: SquadsMultisig,
) {
  program
    .command('check-proposal')
    .description('Execute all the instructions inside of the batch')
    .requiredOption(
      '--proposal-index <index>',
      'What proposal you wish to check',
    )
    .action(async (options) => {
      const [batchPda] = getTransactionPda({
        multisigPda: squadsMultisig.app.multisigAddress,
        index: options.proposalIndex!,
      });
      const treeResult = {
        batch: {},
      };
      const accountInfo =
        await baseApp.anchorProvider.connection.getAccountInfo(batchPda);
      const batch = Batch.deserialize(accountInfo.data);
      for (let i = 1; i <= batch.size; i += 1) {
        const [transactionPda] = getBatchTransactionPda({
          multisigPda: squadsMultisig.app.multisigAddress,
          batchIndex: options.proposalIndex!,
          transactionIndex: i,
        });
        const accountInfo =
          await baseApp.anchorProvider.connection.getAccountInfo(
            transactionPda,
          );
        const transaction = VaultTransaction.deserialize(accountInfo.data);
        for (const instruction of transaction.message.instructions) {
          const method = instruction.data.subarray(0, 8);
          switch (JSON.stringify(Array.from(method))) {
            case AddLiquidity2Discriminator:
              {
                const params = AddLiquidity2Params.deserialize(
                  instruction.data,
                );
                treeResult.batch[`ix_${i} AddLiquidity2`] = {};
                treeResult.batch[`ix_${i} AddLiquidity2`][
                  `tokenAmountIn: ${params.tokenAmountIn}`
                ] = {};
                treeResult.batch[`ix_${i} AddLiquidity2`][
                  `minLpAmountOut: ${params.minLpAmountOut}`
                ] = {};
                treeResult.batch[`ix_${i} AddLiquidity2`][
                  `tokenAmountPreSwap: ${params.tokenAmountPreSwap}`
                ] = {};
              }
              break;
            case RemoveLiquidity2Discriminator:
              {
                const params = RemoveLiquidity2Params.deserialize(
                  instruction.data,
                );
                treeResult.batch[`ix_${i} RemoveLiquidity2`] = {};
                treeResult.batch[`ix_${i} RemoveLiquidity2`][
                  `lpAmountIn: ${params.lpAmountIn}`
                ] = {};
                treeResult.batch[`ix_${i} RemoveLiquidity2`][
                  `minAmountOut: ${params.minAmountOut}`
                ] = {};
              }
              break;
            default: {
              treeResult.batch[`ix_${i} undefined`] = {};
            }
          }
        }
      }
      console.log(treeify.asTree(treeResult));
    });
}
