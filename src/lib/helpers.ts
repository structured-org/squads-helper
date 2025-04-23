import { web3, AnchorProvider } from '@project-serum/anchor';
import { confirmTransaction } from '@solana-developers/helpers';
import { TransactionMessage } from '@solana/web3.js';
import { Logger } from 'pino';

export async function signAndBroadcast(
  provider: AnchorProvider,
  transaction: web3.Transaction,
  keypair: web3.Keypair,
): Promise<string> {
  const blockhash = (await provider.connection.getLatestBlockhash('finalized'))
    .blockhash;
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = new web3.PublicKey(keypair.publicKey);
  transaction.sign({
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
  });
  return await provider.sendAndConfirm(transaction, [keypair], {
    skipPreflight: true,
    commitment: 'processed',
  });
}

export async function signAndBroadcastVersionedTx(
  provider: AnchorProvider,
  transaction: web3.VersionedTransaction,
  keypair: web3.Keypair,
): Promise<string> {
  transaction.sign([keypair]);
  return await provider.connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
  });
}

export async function compileTransactionMessageWithAlt(
  provider: AnchorProvider,
  instructions: Array<web3.TransactionInstruction>,
  sender: web3.PublicKey,
  alt: web3.AddressLookupTableAccount,
): Promise<web3.MessageV0> {
  return new TransactionMessage({
    payerKey: sender,
    recentBlockhash: (await provider.connection.getLatestBlockhash()).blockhash,
    instructions: instructions,
  }).compileToV0Message([alt]);
}

export async function simulateAndBroadcast(
  provider: AnchorProvider,
  tx: web3.Transaction,
  ty: string,
  logger: Logger,
  signer: web3.Keypair,
): Promise<web3.TransactionSignature> {
  logger.info(`Simulating ${ty}`);
  logger.debug(await provider.simulate(tx, [signer]));
  logger.info(`Simulating ${ty} -- success`);
  logger.info('Broadcasting transaction');
  const transactionHash = await provider.connection.sendTransaction(
    tx,
    [signer],
    {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
    },
  );
  logger.info(`Broadcasting transaction -- success ${transactionHash}`);
  logger.info('Waiting for finalization');
  let confirmTransactionAttempt = 1;
  for (; confirmTransactionAttempt <= 3; confirmTransactionAttempt += 1) {
    try {
      await confirmTransaction(
        provider.connection,
        transactionHash,
        'finalized',
      );
      break;
    } catch (e) {
      if (confirmTransactionAttempt === 3) {
        throw e;
      }
      logger.warn(
        `Failed to await for transaction confirmation -- attempt ${confirmTransactionAttempt}/3`,
      );
    }
  }
  logger.info('Transaction finalized');
  return transactionHash;
}
