import * as solana from '@wormhole-foundation/sdk-solana-tokenbridge';
import { web3, BN, AnchorProvider } from '@project-serum/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  type Chain,
  toChainId,
  type Network,
  Contracts,
} from '@wormhole-foundation/sdk-connect';
import { type SolanaChains, utils } from '@wormhole-foundation/sdk-solana';

function deriveSignerSequenceAddress(
  programId: web3.PublicKeyInitData,
  payerKey: web3.PublicKeyInitData,
): web3.PublicKey {
  return utils.deriveAddress(
    [Buffer.from('seq'), new web3.PublicKey(payerKey).toBuffer()],
    programId,
  );
}

export async function createTransferWrappedTokensWithRelayInstructionOffCurve(
  connection: web3.Connection,
  programId: web3.PublicKeyInitData,
  payer: web3.PublicKeyInitData,
  tokenBridgeProgramId: web3.PublicKeyInitData,
  wormholeProgramId: web3.PublicKeyInitData,
  mint: web3.PublicKeyInitData,
  amount: bigint,
  toNativeTokenAmount: bigint,
  recipientAddress: Uint8Array,
  recipientChain: Chain,
  batchId: number,
): Promise<web3.TransactionInstruction> {
  const {
    methods: { transferWrappedTokensWithRelay },
    account: { signerSequence },
  } = solana.createTokenBridgeRelayerProgramInterface(programId, connection);
  const signerSequenceAddress = deriveSignerSequenceAddress(programId, payer);
  const sequence = await signerSequence
    .fetch(signerSequenceAddress)
    .then(({ value }) => value)
    .catch((e) => {
      if (e.message?.includes('Account does not exist')) {
        // first time transferring
        return new BN(0);
      }
      throw e;
    });

  const message = solana.deriveTokenTransferMessageAddress(
    programId,
    payer,
    sequence,
  );
  const fromTokenAccount = getAssociatedTokenAddressSync(
    new web3.PublicKey(mint),
    new web3.PublicKey(payer),
    true,
  );
  const { chain, tokenAddress } = await solana.getWrappedMeta(
    connection,
    tokenBridgeProgramId,
    mint,
  );
  const tmpTokenAccount = solana.deriveTmpTokenAccountAddress(programId, mint);
  const tokenBridgeAccounts = solana.getTransferWrappedWithPayloadCpiAccounts(
    programId,
    tokenBridgeProgramId,
    wormholeProgramId,
    payer,
    message,
    fromTokenAccount,
    chain,
    tokenAddress,
  );

  return transferWrappedTokensWithRelay(
    new BN(amount.toString()),
    new BN(toNativeTokenAmount.toString()),
    toChainId(recipientChain),
    [...recipientAddress],
    batchId,
  )
    .accounts({
      config: solana.deriveSenderConfigAddress(programId),
      payerSequence: signerSequenceAddress,
      foreignContract: solana.deriveForeignContractAddress(
        programId,
        recipientChain,
      ),
      registeredToken: solana.deriveRegisteredTokenAddress(
        programId,
        new web3.PublicKey(mint),
      ),
      tmpTokenAccount,
      tokenBridgeProgram: new web3.PublicKey(tokenBridgeProgramId),
      ...tokenBridgeAccounts,
    })
    .instruction();
}

export function getSolanaAutomaticTokenBridge<
  N extends Network = 'Mainnet',
  SC extends SolanaChains = 'Solana',
>(
  provider: AnchorProvider,
  contracts: Contracts,
): solana.SolanaAutomaticTokenBridge<N, SC> {
  return new solana.SolanaAutomaticTokenBridge(
    'Mainnet',
    'Solana',
    provider.connection,
    contracts,
  ) as solana.SolanaAutomaticTokenBridge<N, SC>;
}
