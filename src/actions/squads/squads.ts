import * as multisig from '@sqds/multisig';
import { web3 } from '@project-serum/anchor';
import { AddressLookupTableAccount } from '@solana/web3.js';
import {
  transactionMessageBeet,
  compileToWrappedMessageV0,
  createBatchAddTransactionInstruction,
} from '@actions/squads/internal';

import { type Config } from '@config/config';
import { Logger } from 'pino';

export class Squads {
  private config: Config;
  private logger: Logger;

  constructor(logger: Logger, config: Config) {
    this.config = config;
    this.logger = logger;
  }

  async createProposalIx(): Promise<web3.TransactionInstruction> {
    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      this.config.anchor_provider.connection,
      this.config.squads_multisig.multisig_address,
    );
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const proposalCreateInstruction = multisig.instructions.proposalCreate({
      multisigPda: this.config.squads_multisig.multisig_address,
      transactionIndex: BigInt(transactionIndex),
      creator: this.config.keypair.publicKey,
      isDraft: true,
    });
    return proposalCreateInstruction;
  }

  async createBatchIx(): Promise<web3.TransactionInstruction> {
    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      this.config.anchor_provider.connection,
      this.config.squads_multisig.multisig_address,
    );
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const batchCreateInstruction = multisig.instructions.batchCreate({
      batchIndex: BigInt(transactionIndex),
      creator: this.config.keypair.publicKey,
      multisigPda: this.config.squads_multisig.multisig_address,
      vaultIndex: 0,
    });
    return batchCreateInstruction;
  }

  async proposalActivateIx(): Promise<web3.TransactionInstruction> {
    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      this.config.anchor_provider.connection,
      this.config.squads_multisig.multisig_address,
    );
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    return multisig.instructions.proposalActivate({
      multisigPda: this.config.squads_multisig.multisig_address,
      member: this.config.keypair.publicKey,
      transactionIndex: BigInt(transactionIndex),
    });
  }

  async proposalApproveIx(): Promise<web3.TransactionInstruction> {
    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      this.config.anchor_provider.connection,
      this.config.squads_multisig.multisig_address,
    );
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    return multisig.instructions.proposalApprove({
      multisigPda: this.config.squads_multisig.multisig_address,
      member: this.config.keypair.publicKey,
      transactionIndex: BigInt(transactionIndex),
    });
  }

  async batchAddIxV0(
    instruction: web3.TransactionInstruction,
    altData?: AddressLookupTableAccount,
  ): Promise<web3.TransactionInstruction> {
    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      this.config.anchor_provider.connection,
      this.config.squads_multisig.multisig_address,
    );
    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: this.config.squads_multisig.multisig_address,
      transactionIndex: BigInt(transactionIndex),
      programId: multisig.PROGRAM_ID,
    });
    const [batchPda] = multisig.getTransactionPda({
      multisigPda: this.config.squads_multisig.multisig_address,
      index: BigInt(transactionIndex),
      programId: multisig.PROGRAM_ID,
    });
    const [batchTransactionPda] = multisig.getBatchTransactionPda({
      multisigPda: this.config.squads_multisig.multisig_address,
      batchIndex: BigInt(transactionIndex),
      transactionIndex: 1,
      programId: multisig.PROGRAM_ID,
    });
    const compiledMessage = compileToWrappedMessageV0({
      payerKey: this.config.squads_multisig.vault_pda,
      recentBlockhash: (
        await this.config.anchor_provider.connection.getLatestBlockhash()
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
    return createBatchAddTransactionInstruction(
      {
        multisig: this.config.squads_multisig.multisig_address,
        member: this.config.keypair.publicKey,
        proposal: proposalPda,
        rentPayer: this.config.keypair.publicKey,
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
}
