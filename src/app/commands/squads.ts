import { Command } from 'commander';
import {
  simulateAndBroadcast,
  simulateAndBroadcastVersionedTx,
} from '@lib/helpers';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';
import { SquadsMultisig } from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import { JupiterPerps } from '@lib/jlp';

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
