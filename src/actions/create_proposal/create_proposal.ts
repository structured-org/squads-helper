import * as multisig from '@sqds/multisig';
import { AnchorProvider, web3 } from '@project-serum/anchor';
import { AddressLookupTableAccount } from '@solana/web3.js';
import {
  transactionMessageBeet,
  compileToWrappedMessageV0,
  createBatchAddTransactionInstruction,
} from '@actions/create_proposal/internal';

export async function createProposalRawInstruction(
  multisigKey: web3.PublicKey,
  provider: AnchorProvider,
  memberKey: web3.PublicKey,
): Promise<web3.TransactionInstruction> {
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    provider.connection,
    multisigKey,
  );
  const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
  const proposalCreateInstruction = multisig.instructions.proposalCreate({
    multisigPda: multisigKey,
    transactionIndex: BigInt(transactionIndex),
    creator: memberKey,
    isDraft: true,
  });
  return proposalCreateInstruction;
}

export async function createBatchRawInstruction(
  multisigKey: web3.PublicKey,
  provider: AnchorProvider,
  memberKey: web3.PublicKey,
): Promise<web3.TransactionInstruction> {
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    provider.connection,
    multisigKey,
  );
  const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
  const batchCreateInstruction = multisig.instructions.batchCreate({
    batchIndex: BigInt(transactionIndex),
    creator: memberKey,
    multisigPda: multisigKey,
    vaultIndex: 0,
  });
  return batchCreateInstruction;
}

export async function batchAddRawInstructionV0(
  multisigKey: web3.PublicKey,
  provider: AnchorProvider,
  memberKey: web3.PublicKey,
  instruction: web3.TransactionInstruction,
  multisigAta: string,
  altData: AddressLookupTableAccount,
): Promise<web3.TransactionInstruction> {
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    provider.connection,
    multisigKey,
  );
  const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: multisigKey,
    transactionIndex: BigInt(transactionIndex),
    programId: multisig.PROGRAM_ID,
  });
  const [batchPda] = multisig.getTransactionPda({
    multisigPda: multisigKey,
    index: BigInt(transactionIndex),
    programId: multisig.PROGRAM_ID,
  });
  const [batchTransactionPda] = multisig.getBatchTransactionPda({
    multisigPda: multisigKey,
    batchIndex: BigInt(transactionIndex),
    transactionIndex: 1,
    programId: multisig.PROGRAM_ID,
  });
  const compiledMessage = compileToWrappedMessageV0({
    payerKey: new web3.PublicKey(multisigAta),
    recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
    instructions: [instruction],
    addressLookupTableAccounts: [altData],
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
      multisig: multisigKey,
      member: memberKey,
      proposal: proposalPda,
      rentPayer: memberKey,
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

export async function proposalActivateRawInstruction(
  multisigKey: web3.PublicKey,
  provider: AnchorProvider,
  memberKey: web3.PublicKey,
): Promise<web3.TransactionInstruction> {
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    provider.connection,
    multisigKey,
  );
  const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
  return multisig.instructions.proposalActivate({
    multisigPda: multisigKey,
    member: memberKey,
    transactionIndex: BigInt(transactionIndex),
  });
}

export async function proposalApproveRawInstruction(
  multisigKey: web3.PublicKey,
  provider: AnchorProvider,
  memberKey: web3.PublicKey,
): Promise<web3.TransactionInstruction> {
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    provider.connection,
    multisigKey,
  );
  const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
  return multisig.instructions.proposalApprove({
    multisigPda: multisigKey,
    member: memberKey,
    transactionIndex: BigInt(transactionIndex),
  });
}
