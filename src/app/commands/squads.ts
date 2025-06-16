import { Command } from 'commander';
import {
  simulateAndBroadcast,
  simulateAndBroadcastVersionedTx,
} from '@lib/helpers';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';
import {
  ProposalStatus,
  proposalStatusToString,
  SquadsMultisig,
} from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import {
  AddLiquidity2Discriminator,
  AddLiquidity2Params,
  RemoveLiquidity2Discriminator,
  RemoveLiquidity2Params,
} from '@lib/jlp';
import { instructions as SquadsInstructions } from '@sqds/multisig';
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
    .action(async (options) => {
      const ms = await squadsMultisig.getMultisig();
      const proposal = await squadsMultisig.getProposal(options.proposalIndex!);

      // Activate proposal if it's a Draft
      let activateProposalIx: undefined | web3.TransactionInstruction =
        undefined;
      if (proposal.status === ProposalStatus.Draft) {
        activateProposalIx = squadsMultisig.proposalActivateByIndexIx(
          options.proposalIndex!,
        );
      }

      // Vote for it to make it Approved. Skip those who voted
      const excludedKeys = new Set([
        ...proposal.approved.map((k) => k.toBase58()),
        ...proposal.rejected.map((k) => k.toBase58()),
        ...proposal.cancelled.map((k) => k.toBase58()),
      ]);
      const voters = ms.members
        .filter((member) => member.permissions.mask === 7)
        .filter((member) => !excludedKeys.has(member.key.toBase58()));
      const voteIxs: Array<web3.TransactionInstruction> = [];
      if (
        proposal.status === ProposalStatus.Draft ||
        proposal.status === ProposalStatus.Active
      ) {
        let threshold = ms.threshold;
        let i = 0;
        while (i < voters.length && threshold--) {
          const voteIx = SquadsInstructions.proposalApprove({
            multisigPda: squadsMultisig.app.multisigAddress,
            transactionIndex: options.proposalIndex!,
            member: voters[i].key,
          });
          voteIxs.push(voteIx);
          i += 1;
        }
      }

      // Execute all transactions from the batch at once
      const batch = await squadsMultisig.getBatch(options.proposalIndex!);
      const batchSize = batch.size;
      const batchExecuteIxs = await squadsMultisig.proposalExecuteBatchIxs(
        options.proposalIndex!,
        batchSize,
      );
      const txMsgV0 = new web3.TransactionMessage({
        payerKey: baseApp.keypair.publicKey,
        recentBlockhash: (
          await baseApp.anchorProvider.connection.getLatestBlockhash()
        ).blockhash,
        instructions: [
          ...(activateProposalIx ? [activateProposalIx] : []),
          ...voteIxs,
          ...batchExecuteIxs.batchIxs,
        ],
      }).compileToV0Message(batchExecuteIxs.altTables);
      const tx = new web3.VersionedTransaction(txMsgV0);
      const simulationResult =
        await baseApp.anchorProvider.connection.simulateTransaction(tx);
      if (simulationResult.value.err === null) {
        console.dir(simulationResult, { maxArrayLength: null });
      } else {
        throw new Error(JSON.stringify(simulationResult, null, 2));
      }
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
    .action(async (options) => {
      const batch = await squadsMultisig.getBatch(options.proposalIndex!);
      const executeProposalMsg = await squadsMultisig.proposalExecuteMsgV0(
        options.proposalIndex!,
        batch.size,
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

export function registerShowMultisigCommand(
  program: Command,
  squadsMultisig: SquadsMultisig,
) {
  program
    .command('show-multisig')
    .description('Show the multisig information')
    .action(async () => {
      const multisig = await squadsMultisig.getMultisig();
      console.log({
        ...multisig,
        createKey: multisig.createKey.toBase58(),
        configAuthority: multisig.configAuthority.toBase58(),
        members: multisig.members.map((member) => ({
          key: member.key.toBase58(),
          mask: member.permissions.mask,
        })),
      });
    });
}

export function registerCheckProposalCommand(
  program: Command,
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
      const treeResult = {
        proposal: {
          batch: {},
        },
      };
      const vaultTxs = await squadsMultisig.getTransactions(
        options.proposalIndex!,
      );
      for (const [i, transaction] of vaultTxs.entries()) {
        for (const instruction of transaction.message.instructions) {
          const method = instruction.data.subarray(0, 8);
          switch (JSON.stringify(Array.from(method))) {
            case AddLiquidity2Discriminator:
              {
                const params = AddLiquidity2Params.deserialize(
                  instruction.data,
                );
                treeResult.proposal.batch[`ix_${i + 1} AddLiquidity2`] = {};
                treeResult.proposal.batch[`ix_${i + 1} AddLiquidity2`][
                  `tokenAmountIn: ${params.tokenAmountIn}`
                ] = {};
                treeResult.proposal.batch[`ix_${i + 1} AddLiquidity2`][
                  `minLpAmountOut: ${params.minLpAmountOut}`
                ] = {};
                treeResult.proposal.batch[`ix_${i + 1} AddLiquidity2`][
                  `tokenAmountPreSwap: ${params.tokenAmountPreSwap}`
                ] = {};
              }
              break;
            case RemoveLiquidity2Discriminator:
              {
                const params = RemoveLiquidity2Params.deserialize(
                  instruction.data,
                );
                treeResult.proposal.batch[`ix_${i + 1} RemoveLiquidity2`] = {};
                treeResult.proposal.batch[`ix_${i + 1} RemoveLiquidity2`][
                  `lpAmountIn: ${params.lpAmountIn}`
                ] = {};
                treeResult.proposal.batch[`ix_${i + 1} RemoveLiquidity2`][
                  `minAmountOut: ${params.minAmountOut}`
                ] = {};
              }
              break;
            default: {
              treeResult.proposal.batch[`ix_${i + 1} undefined`] = {};
            }
          }
        }
      }
      const proposal = await squadsMultisig.getProposal(options.proposalIndex!);
      treeResult[`proposal (${proposalStatusToString(proposal.status)})`] =
        treeResult.proposal;
      delete treeResult.proposal;
      console.log(treeify.asTree(treeResult));
    });
}
