import { web3, Program, BN, AnchorProvider } from '@project-serum/anchor';
import { ProvideLiquidityConfig } from '@config/config';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { AccountMeta } from '@solana/web3.js';

export async function prepareRawInstruction(
  provider: AnchorProvider,
  provideLiquidityConfig: ProvideLiquidityConfig,
  programIdlPath: string,
  multisigAta: string,
  jlp_address: string,
  accounts: string[],
): Promise<web3.TransactionInstruction> {
  const program = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.program,
  );
  const programIdl = JSON.parse(
    require('fs').readFileSync(programIdlPath, {
      encoding: 'utf-8',
    }),
  );
  const programInstance = new Program(programIdl, program, provider);
  const owner = new web3.PublicKey(multisigAta);
  const fundingAccount = new web3.PublicKey(
    getAssociatedTokenAddressSync(
      new web3.PublicKey(provideLiquidityConfig.token_address),
      owner,
      true,
    ).toBase58(),
  );
  const lpTokenAccount = new web3.PublicKey(
    getAssociatedTokenAddressSync(
      new web3.PublicKey(jlp_address),
      owner,
      true,
    ).toBase58(),
  );
  const transferAuthority = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.transfer_authority,
  );
  const perpetuals = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.perpetuals,
  );
  const pool = new web3.PublicKey(provideLiquidityConfig.input_accounts.pool);
  const custody = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.custody,
  );
  const custodyDovesPriceAccount = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.custody_doves_price_account,
  );
  const custodyPythnetPriceAccount = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.custody_pythnet_price_account,
  );
  const custodyTokenAccount = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.custody_token_account,
  );
  const lpTokenMint = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.lp_token_mint,
  );
  const tokenProgram = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.token_program,
  );
  const eventAuthority = new web3.PublicKey(
    provideLiquidityConfig.input_accounts.event_authority,
  );
  const remainingAccounts: AccountMeta[] = accounts.map((account) => ({
    pubkey: new web3.PublicKey(account),
    isWritable: false,
    isSigner: false,
  }));
  const params = {
    tokenAmountIn: new BN(123),
    minLpAmountOut: new BN(1),
    tokenAmountPreSwap: null,
  };
  const transaction = programInstance.methods
    .addLiquidity2(params)
    .accounts({
      owner,
      fundingAccount,
      lpTokenAccount,
      transferAuthority,
      perpetuals,
      pool,
      custody,
      custodyDovesPriceAccount,
      custodyPythnetPriceAccount,
      custodyTokenAccount,
      lpTokenMint,
      tokenProgram,
      eventAuthority,
      program,
    })
    .remainingAccounts(remainingAccounts);
  try {
    await provider.simulate(await transaction.transaction());
  } catch (err) {
    console.error('Error when tried to simulate given transaction', err);
    process.exit(-1);
  }
  return await transaction.instruction();
}
