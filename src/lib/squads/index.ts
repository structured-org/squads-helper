import * as multisig from '@sqds/multisig';
import { web3 } from '@project-serum/anchor';
import { AddressLookupTableAccount } from '@solana/web3.js';
import {
  transactionMessageBeet,
  compileToWrappedMessageV0,
  createBatchAddTransactionInstruction,
} from '@lib/squads/internal';

import { type BaseApp, type SquadsMultisigApp } from '@config/config';
import { Logger } from 'pino';
import { Multisig } from '@sqds/multisig/lib/generated';

export class SquadsMultisig {
  private logger: Logger;
  private squadsMultisigApp: SquadsMultisigApp;
  private baseApp: BaseApp;

  constructor(
    logger: Logger,
    baseApp: BaseApp,
    squadsMultisigApp: SquadsMultisigApp,
  ) {
    this.logger = logger;
    this.squadsMultisigApp = squadsMultisigApp;
    this.baseApp = baseApp;
  }

  get app(): SquadsMultisigApp {
    return this.squadsMultisigApp;
  }

  async getMultisigInfo(): Promise<Multisig> {
    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      this.baseApp.anchorProvider.connection,
      this.squadsMultisigApp.multisigAddress,
    );
    return multisigInfo;
  }

  async createProposalIx(): Promise<web3.TransactionInstruction> {
    const multisigInfo = await this.getMultisigInfo();
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const proposalCreateInstruction = multisig.instructions.proposalCreate({
      multisigPda: this.squadsMultisigApp.multisigAddress,
      transactionIndex: BigInt(transactionIndex),
      creator: this.baseApp.keypair.publicKey,
      isDraft: true,
    });
    this.logger.info(
      `Create Proposal Transaction Index -- ${transactionIndex}`,
    );
    return proposalCreateInstruction;
  }

  async createBatchIx(): Promise<web3.TransactionInstruction> {
    const multisigInfo = await this.getMultisigInfo();
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const batchCreateInstruction = multisig.instructions.batchCreate({
      batchIndex: BigInt(transactionIndex),
      creator: this.baseApp.keypair.publicKey,
      multisigPda: this.squadsMultisigApp.multisigAddress,
      vaultIndex: 0,
    });
    this.logger.info(`Create Batch Transaction Index -- ${transactionIndex}`);
    return batchCreateInstruction;
  }

  proposalActivateByIndexIx(index: number): web3.TransactionInstruction {
    this.logger.info(`Proposal Activate Transaction Index -- ${index}`);
    const ix = multisig.instructions.proposalActivate({
      multisigPda: this.squadsMultisigApp.multisigAddress,
      member: this.baseApp.keypair.publicKey,
      transactionIndex: BigInt(index),
    });
    return ix;
  }

  async proposalActivateIx(): Promise<web3.TransactionInstruction> {
    const multisigInfo = await this.getMultisigInfo();
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    return this.proposalActivateByIndexIx(transactionIndex);
  }

  async proposalExecuteMsgV0(
    index: number,
    instructionsCount: number,
    altData?: AddressLookupTableAccount,
  ): Promise<web3.MessageV0> {
    const batchInstructions: Array<web3.TransactionInstruction> = [];
    for (let i = 1; i <= instructionsCount; i += 1) {
      const res = await multisig.instructions.batchExecuteTransaction({
        connection: this.baseApp.anchorProvider.connection,
        multisigPda: this.squadsMultisigApp.multisigAddress,
        member: this.baseApp.keypair.publicKey,
        batchIndex: BigInt(index),
        transactionIndex: i,
      });
      batchInstructions.push(res.instruction);
    }
    return new web3.TransactionMessage({
      payerKey: this.baseApp.keypair.publicKey,
      recentBlockhash: (
        await this.baseApp.anchorProvider.connection.getLatestBlockhash()
      ).blockhash,
      instructions: batchInstructions,
    }).compileToV0Message([altData]);
  }

  async batchAddByIndexIxV0(
    index: number,
    proposalInstructionIndex: number,
    instruction: web3.TransactionInstruction,
    altData?: AddressLookupTableAccount,
  ): Promise<web3.TransactionInstruction> {
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: this.squadsMultisigApp.multisigAddress,
      transactionIndex: BigInt(index),
      programId: multisig.PROGRAM_ID,
    });
    const [batchPda] = multisig.getTransactionPda({
      multisigPda: this.squadsMultisigApp.multisigAddress,
      index: BigInt(index),
      programId: multisig.PROGRAM_ID,
    });
    const [batchTransactionPda] = multisig.getBatchTransactionPda({
      multisigPda: this.squadsMultisigApp.multisigAddress,
      batchIndex: BigInt(index),
      transactionIndex: proposalInstructionIndex,
      programId: multisig.PROGRAM_ID,
    });
    const compiledMessage = compileToWrappedMessageV0({
      payerKey: this.squadsMultisigApp.vaultPda,
      recentBlockhash: (
        await this.baseApp.anchorProvider.connection.getLatestBlockhash()
      ).blockhash,
      instructions: [instruction],
      addressLookupTableAccounts: altData ? [altData] : undefined,
    });
    const [transactionMessageBytes] = transactionMessageBeet.serialize({
      numSigners: compiledMessage.header.numRequiredSignatures,
      numWritableSigners:
        compiledMessage.header.numRequiredSignatures -
        compiledMessage.header.numReadonlySignedAccounts,
      numWritableNonSigners:
        compiledMessage.staticAccountKeys.length -
        compiledMessage.header.numRequiredSignatures -
        compiledMessage.header.numReadonlyUnsignedAccounts,
      accountKeys: compiledMessage.staticAccountKeys,
      instructions: compiledMessage.compiledInstructions.map((ix) => ({
        programIdIndex: ix.programIdIndex,
        accountIndexes: ix.accountKeyIndexes,
        data: Array.from(ix.data),
      })),
      addressTableLookups: compiledMessage.addressTableLookups,
    });
    this.logger.info(`Alt Data Defined -- ${altData ? true : false}`);
    this.logger.info(`Batch PDA -- ${batchPda.toBase58()}`);
    this.logger.info(`Proposal PDA -- ${proposalPda.toBase58()}`);
    this.logger.info(`Transaction PDA -- ${batchTransactionPda.toBase58()}`);
    this.logger.info(`Transaction Index -- ${index}`);
    return createBatchAddTransactionInstruction(
      {
        multisig: this.squadsMultisigApp.multisigAddress,
        member: this.baseApp.keypair.publicKey,
        proposal: proposalPda,
        rentPayer: this.baseApp.keypair.publicKey,
        batch: batchPda,
        transaction: batchTransactionPda,
      },
      {
        args: {
          ephemeralSigners: 0,
          transactionMessage: transactionMessageBytes,
        },
      },
      multisig.PROGRAM_ID,
    );
  }

  async batchAddIxV0(
    instruction: web3.TransactionInstruction,
    altData?: AddressLookupTableAccount,
  ): Promise<web3.TransactionInstruction> {
    const multisigInfo = await this.getMultisigInfo();
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    return this.batchAddByIndexIxV0(transactionIndex, 1, instruction, altData);
  }
}
