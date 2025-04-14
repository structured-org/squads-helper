import { web3, AnchorProvider } from '@project-serum/anchor';
import { TransactionMessage } from '@solana/web3.js';

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
