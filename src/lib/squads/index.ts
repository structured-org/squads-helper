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
import {
  getBatchTransactionPda,
  getProposalPda,
  getTransactionPda,
} from '@sqds/multisig';

export class Ms {
  createKey: web3.PublicKey;
  configAuthority: web3.PublicKey;
  threshold: number; // u16
  timelock: number; // u32
  transactionIndex: bigint; // u64
  staleTransactionIndex: bigint; // u64
  rentCollector: null | web3.PublicKey; // Option<web3.PublicKey>
  bump: number; // u8
  members: Array<{
    key: web3.PublicKey;
    permissions: {
      mask: number; // u8
    };
  }>;

  static deserialize(data: Uint8Array): Ms {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8;

    const createKey = new web3.PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const configAuthority = new web3.PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const threshold = view.getUint16(offset, true);
    offset += 2;

    const timelock = view.getUint32(offset, true);
    offset += 4;

    const transactionIndex = view.getBigUint64(offset, true);
    offset += 8;

    const staleTransactionIndex = view.getBigUint64(offset, true);
    offset += 8;

    // Option<PublicKey>
    const hasRentCollector = view.getUint8(offset);
    offset += 1;

    let rentCollector: web3.PublicKey | null = null;
    if (hasRentCollector) {
      rentCollector = new web3.PublicKey(data.slice(offset, offset + 32));
      offset += 32;
    }

    const bump = view.getUint8(offset);
    offset += 1;

    // Vec<Member>
    const membersLength = view.getUint32(offset, true);
    offset += 4;

    const members: Ms['members'] = [];
    for (let i = 0; i < membersLength; i++) {
      const key = new web3.PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const mask = view.getUint8(offset);
      offset += 1;

      members.push({ key, permissions: { mask } });
    }

    return {
      createKey,
      configAuthority,
      threshold,
      timelock,
      transactionIndex,
      staleTransactionIndex,
      rentCollector,
      bump,
      members,
    };
  }
}

export enum ProposalStatus {
  Draft, // { timestamp: i64 }
  Active, // { timestamp: i64 }
  Rejected, // { timestamp: i64 }
  Approved, // { timestamp: i64 }
  Executing,
  Executed, // { timestamp: i64 }
  Cancelled, // { timestamp: i64 }
}

export function proposalStatusToString(status: ProposalStatus) {
  switch (status) {
    case ProposalStatus.Draft:
      return 'Draft';
    case ProposalStatus.Active:
      return 'Active';
    case ProposalStatus.Rejected:
      return 'Rejected';
    case ProposalStatus.Approved:
      return 'Approved';
    case ProposalStatus.Executing:
      return 'Executing';
    case ProposalStatus.Executed:
      return 'Executed';
    case ProposalStatus.Cancelled:
      return 'Cancelled';
  }
}

export class Proposal {
  multisig: web3.PublicKey;
  transactionIndex: bigint; // u64
  status: ProposalStatus;
  bump: number; // u8
  approved: Array<web3.PublicKey>;
  rejected: Array<web3.PublicKey>;
  cancelled: Array<web3.PublicKey>;

  static deserialize(data: Uint8Array): Proposal {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8;

    // multisig: PublicKey (32 bytes)
    const multisig = new web3.PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // transaction_index: u64 (8 bytes)
    const transactionIndex = view.getBigUint64(offset, true);
    offset += 8;

    // status: enum u8 (1 byte)
    const statusByte = view.getUint8(offset);
    offset += 1;
    const status = statusByte as ProposalStatus;

    // timestamp: i64 (8 bytes) only for some statuses
    // Statuses with timestamp: Draft, Active, Rejected, Approved, Executed, Cancelled
    // Status without timestamp: Executing
    if (
      status === ProposalStatus.Draft ||
      status === ProposalStatus.Active ||
      status === ProposalStatus.Rejected ||
      status === ProposalStatus.Approved ||
      status === ProposalStatus.Executed ||
      status === ProposalStatus.Cancelled
    ) {
      offset += 8;
    }

    // bump: u8 (1 byte)
    const bump = view.getUint8(offset);
    offset += 1;

    // Helper to read Vec<PublicKey> (length-prefixed)
    function readPubkeyArray(): web3.PublicKey[] {
      // Vec<u8> length prefix for count of items
      const length = Number(view.getUint32(offset, true));
      offset += 4;

      const arr: web3.PublicKey[] = [];
      for (let i = 0; i < length; i++) {
        const key = new web3.PublicKey(data.slice(offset, offset + 32));
        arr.push(key);
        offset += 32;
      }
      return arr;
    }

    const approved = readPubkeyArray();
    const rejected = readPubkeyArray();
    const cancelled = readPubkeyArray();

    return {
      multisig,
      transactionIndex,
      status,
      bump,
      approved,
      rejected,
      cancelled,
    };
  }
}

export class Batch {
  multisig: web3.PublicKey;
  creator: web3.PublicKey;
  index: bigint; // u64
  bump: number; // u8
  vaultIndex: number; // u8
  vaultBump: number; //u8
  size: number; // u32
  executedTransactionIndex: number; // u32

  static deserialize(data: Uint8Array): Batch {
    const dataView = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    let offset = 8; // skip discriminator

    const multisig = new web3.PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const creator = new web3.PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const index = dataView.getBigUint64(offset, true); // little-endian
    offset += 8;

    const bump = dataView.getUint8(offset);
    offset += 1;

    const vaultIndex = dataView.getUint8(offset);
    offset += 1;

    const vaultBump = dataView.getUint8(offset);
    offset += 1;

    const size = dataView.getUint32(offset, true);
    offset += 4;

    const executedTransactionIndex = dataView.getUint32(offset, true);
    offset += 4;

    return {
      multisig,
      creator,
      index,
      bump,
      vaultIndex,
      vaultBump,
      size,
      executedTransactionIndex,
    };
  }
}

export class VaultTransaction {
  bump: number; // u8
  ephemeralSignerBumps: Array<number>; // Vec<u8>
  message: {
    numSigners: number;
    numWritableSigners: number;
    numWritableNonSigners: number;
    accountKeys: Array<web3.PublicKey>;
    instructions: Array<{
      programIdIndex: number;
      accountIndexes: Uint8Array;
      data: Uint8Array;
    }>;
    addressTableLookups: Array<{
      accountKey: web3.PublicKey;
      writableIndexes: Uint8Array;
      readonlyIndexes: Uint8Array;
    }>;
  };

  static deserialize(data: Uint8Array): VaultTransaction {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8; // skip discriminator

    const bump = view.getUint8(offset);
    offset += 1;

    // Deserialize ephemeralSignerBumps (Vec<u8>)
    const bumpsLen = view.getUint32(offset, true);
    offset += 4;
    const ephemeralSignerBumps: number[] = [];
    for (let i = 0; i < bumpsLen; i++) {
      ephemeralSignerBumps.push(view.getUint8(offset));
      offset += 1;
    }

    // numSigners, numWritableSigners, numWritableNonSigners (u8 each)
    const numSigners = view.getUint8(offset++);
    const numWritableSigners = view.getUint8(offset++);
    const numWritableNonSigners = view.getUint8(offset++);

    // Deserialize accountKeys (Vec<Pubkey>)
    const accKeysLen = view.getUint32(offset, true);
    offset += 4;
    const accountKeys: web3.PublicKey[] = [];
    for (let i = 0; i < accKeysLen; i++) {
      accountKeys.push(new web3.PublicKey(data.slice(offset, offset + 32)));
      offset += 32;
    }

    // Deserialize instructions (Vec)
    const instrLen = view.getUint32(offset, true);
    offset += 4;
    const instructions = [];
    for (let i = 0; i < instrLen; i++) {
      const programIdIndex = view.getUint8(offset++);

      const accountIndexesLen = view.getUint32(offset, true);
      offset += 4;
      const accountIndexes = data.slice(offset, offset + accountIndexesLen);
      offset += accountIndexesLen;

      const dataLen = view.getUint32(offset, true);
      offset += 4;
      const instrData = data.slice(offset, offset + dataLen);
      offset += dataLen;

      instructions.push({
        programIdIndex,
        accountIndexes,
        data: instrData,
      });
    }

    // Deserialize addressTableLookups (Vec)
    const tableLookupsLen = view.getUint32(offset, true);
    offset += 4;
    const addressTableLookups = [];
    for (let i = 0; i < tableLookupsLen; i++) {
      const accountKey = new web3.PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const writableLen = view.getUint32(offset, true);
      offset += 4;
      const writableIndexes = data.slice(offset, offset + writableLen);
      offset += writableLen;

      const readonlyLen = view.getUint32(offset, true);
      offset += 4;
      const readonlyIndexes = data.slice(offset, offset + readonlyLen);
      offset += readonlyLen;

      addressTableLookups.push({
        accountKey,
        writableIndexes,
        readonlyIndexes,
      });
    }
    return {
      bump,
      ephemeralSignerBumps,
      message: {
        numSigners,
        numWritableSigners,
        numWritableNonSigners,
        accountKeys,
        instructions,
        addressTableLookups,
      },
    };
  }
}

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

  async getMultisig(): Promise<Ms> {
    const msPdaAccountInfo =
      await this.baseApp.anchorProvider.connection.getAccountInfo(
        this.squadsMultisigApp.multisigAddress,
      );
    const ms = Ms.deserialize(msPdaAccountInfo.data);
    return ms;
  }

  async getBatch(proposalIndex: number): Promise<Batch> {
    const [batchPda] = getTransactionPda({
      multisigPda: this.squadsMultisigApp.multisigAddress,
      index: BigInt(proposalIndex),
    });
    const batchPdaAccountInfo =
      await this.baseApp.anchorProvider.connection.getAccountInfo(batchPda);
    const batch = Batch.deserialize(batchPdaAccountInfo.data);
    return batch;
  }

  async getProposal(proposalIndex: number): Promise<Proposal> {
    const [proposalPda] = getProposalPda({
      multisigPda: this.squadsMultisigApp.multisigAddress,
      transactionIndex: BigInt(proposalIndex),
    });
    const proposalPdaAccountInfo =
      await this.baseApp.anchorProvider.connection.getAccountInfo(proposalPda);
    const proposal = Proposal.deserialize(proposalPdaAccountInfo.data);
    return proposal;
  }

  async getTransactions(
    proposalIndex: number,
  ): Promise<Array<VaultTransaction>> {
    const batch = await this.getBatch(proposalIndex);
    const vaultTxs = [];
    for (let i = 1; i <= batch.size; i += 1) {
      const [transactionPda] = getBatchTransactionPda({
        multisigPda: this.squadsMultisigApp.multisigAddress,
        batchIndex: BigInt(proposalIndex),
        transactionIndex: i,
      });
      const accountInfo =
        await this.baseApp.anchorProvider.connection.getAccountInfo(
          transactionPda,
        );
      const transaction = VaultTransaction.deserialize(accountInfo.data);
      vaultTxs.push(transaction);
    }
    return vaultTxs;
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

  async proposalExecuteBatchIxs(
    index: number,
    instructionsCount: number,
  ): Promise<{
    batchIxs: Array<web3.TransactionInstruction>;
    altTables: Array<web3.AddressLookupTableAccount>;
  }> {
    const batchInstructions: Array<web3.TransactionInstruction> = [];
    const altTables: Array<web3.AddressLookupTableAccount> = [];
    for (let i = 1; i <= instructionsCount; i += 1) {
      const res = await multisig.instructions.batchExecuteTransaction({
        connection: this.baseApp.anchorProvider.connection,
        multisigPda: this.squadsMultisigApp.multisigAddress,
        member: this.baseApp.keypair.publicKey,
        batchIndex: BigInt(index),
        transactionIndex: i,
      });
      batchInstructions.push(res.instruction);
      for (const alt of res.lookupTableAccounts) {
        altTables.push(alt);
      }
    }
    return { batchIxs: batchInstructions, altTables: altTables };
  }

  async proposalExecuteMsgV0(
    index: number,
    instructionsCount: number,
  ): Promise<web3.MessageV0> {
    const batchIxs = await this.proposalExecuteBatchIxs(
      index,
      instructionsCount,
    );
    return new web3.TransactionMessage({
      payerKey: this.baseApp.keypair.publicKey,
      recentBlockhash: (
        await this.baseApp.anchorProvider.connection.getLatestBlockhash()
      ).blockhash,
      instructions: batchIxs.batchIxs,
    }).compileToV0Message([...batchIxs.altTables]);
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
