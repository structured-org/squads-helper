import { Command } from 'commander';
import {
  simulateAndBroadcast,
  simulateAndBroadcastVersionedTx,
} from '@lib/helpers';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';
import {
  Batch,
  Ms,
  Proposal,
  proposalStatusToString,
  SquadsMultisig,
  VaultTransaction,
} from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import {
  AddLiquidity2Discriminator,
  AddLiquidity2Params,
  RemoveLiquidity2Discriminator,
  RemoveLiquidity2Params,
} from '@lib/jlp';
import {
  getBatchTransactionPda,
  getProposalPda,
  getTransactionPda,
  instructions as SquadsInstructions,
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

export function registerSimulateProposalCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  squadsMultisig: SquadsMultisig,
) {
  program
    .command('simulate-proposal')
    .description('Execute all the instructions inside of the batch')
    .requiredOption(
      '--proposal-index <index>',
      'What proposal you wish to execute. This values can be usually taken from the logs of create-proposal',
    )
    .requiredOption(
      '--instructions-count <index>',
      'Amount of instructions inside of the batch we need to simulate in a row',
    )
    .action(async (options) => {
      const msPdaAccountInfo =
        await baseApp.anchorProvider.connection.getAccountInfo(
          squadsMultisig.app.multisigAddress,
        );
      const ms = Ms.deserialize(msPdaAccountInfo.data);
      const voters = ms.members.filter(
        (member) => member.permissions.maks === 7,
      );
      let threshold = ms.threshold;
      const voteIxs: Array<web3.TransactionInstruction> = [];
      let i = 0;
      while (threshold--) {
        const voteIx = SquadsInstructions.proposalApprove({
          multisigPda: squadsMultisig.app.multisigAddress,
          transactionIndex: options.proposalIndex!,
          member: voters[i].key,
        });
        voteIxs.push(voteIx);
        i += 1;
      }
      const batchExecuteIxs = await squadsMultisig.proposalExecuteBatchIxs(
        options.proposalIndex!,
        options.instructionsCount!,
      );
      const txMsgV0 = new web3.TransactionMessage({
        payerKey: baseApp.keypair.publicKey,
        recentBlockhash: (
          await baseApp.anchorProvider.connection.getLatestBlockhash()
        ).blockhash,
        instructions: [...voteIxs, ...batchExecuteIxs.batchIxs],
      }).compileToV0Message(batchExecuteIxs.altTables);
      const tx = new web3.VersionedTransaction(txMsgV0);
      const simulationResult =
        await baseApp.anchorProvider.connection.simulateTransaction(tx);
      console.dir(simulationResult, { maxArrayLength: null });
    });
}

export function registerExecuteProposalCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  squadsMultisig: SquadsMultisig,
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
      const batchPdaAccountInfo =
        await baseApp.anchorProvider.connection.getAccountInfo(batchPda);
      const batch = Batch.deserialize(batchPdaAccountInfo.data);
      const treeResult = {
        proposal: {
          batch: {},
        },
      };
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
                treeResult.proposal.batch[`ix_${i} AddLiquidity2`] = {};
                treeResult.proposal.batch[`ix_${i} AddLiquidity2`][
                  `tokenAmountIn: ${params.tokenAmountIn}`
                ] = {};
                treeResult.proposal.batch[`ix_${i} AddLiquidity2`][
                  `minLpAmountOut: ${params.minLpAmountOut}`
                ] = {};
                treeResult.proposal.batch[`ix_${i} AddLiquidity2`][
                  `tokenAmountPreSwap: ${params.tokenAmountPreSwap}`
                ] = {};
              }
              break;
            case RemoveLiquidity2Discriminator:
              {
                const params = RemoveLiquidity2Params.deserialize(
                  instruction.data,
                );
                treeResult.proposal.batch[`ix_${i} RemoveLiquidity2`] = {};
                treeResult.proposal.batch[`ix_${i} RemoveLiquidity2`][
                  `lpAmountIn: ${params.lpAmountIn}`
                ] = {};
                treeResult.proposal.batch[`ix_${i} RemoveLiquidity2`][
                  `minAmountOut: ${params.minAmountOut}`
                ] = {};
              }
              break;
            default: {
              treeResult.proposal.batch[`ix_${i} undefined`] = {};
            }
          }
        }
      }
      const [proposalPda] = getProposalPda({
        multisigPda: squadsMultisig.app.multisigAddress,
        transactionIndex: options.proposalIndex!,
      });
      const proposalPdaAccountInfo =
        await baseApp.anchorProvider.connection.getAccountInfo(proposalPda);
      const proposal = Proposal.deserialize(proposalPdaAccountInfo.data);
      treeResult[`proposal (${proposalStatusToString(proposal.status)})`] =
        treeResult.proposal;
      delete treeResult.proposal;
      console.log(treeify.asTree(treeResult));
    });
}
