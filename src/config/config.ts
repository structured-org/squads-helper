import { web3, AnchorProvider } from '@project-serum/anchor';
import { parse } from 'yaml';
import fs from 'fs';

export type ProvideLiquidityConfig = {
  coin: 'WSOL' | 'USDC' | 'WETH';
  token_address: string;
  input_accounts: {
    transfer_authority: string;
    perpetuals: string;
    pool: string;
    custody: string;
    custody_doves_price_account: string;
    custody_pythnet_price_account: string;
    custody_token_account: string;
    lp_token_mint: string;
    token_program: string;
    event_authority: string;
    program: string;
  };
};

type ConfigFile = {
  multisig_address: string;
  multisig_ata: string;
  squads_multisig_idl: string;
  provide_liquidity: {
    program_idl: string;
    jlp_address: string;
    alt_table?: string;
    accounts: string[];
    coins: ProvideLiquidityConfig[];
  };
};

function parseConfig(configPath: string): ConfigFile {
  const content = fs.readFileSync(configPath).toString();
  return parse(content);
}

export type Config = {
  multisig_address: string;
  multisig_ata: string;
  anchor_provider: AnchorProvider;
  keypair: web3.Keypair;
  squads_multisig_idl: string;
  provide_liquidity: {
    program_idl: string;
    jlp_address: string;
    alt_table?: string;
    accounts: string[];
    coins: Map<string, ProvideLiquidityConfig>;
  };
};

export function getConfig(configPath: string): Config {
  const config: ConfigFile = parseConfig(configPath);
  const keypair = web3.Keypair.fromSecretKey(
    Buffer.from(
      JSON.parse(
        fs.readFileSync(process.env.ANCHOR_WALLET, {
          encoding: 'utf-8',
        }),
      ),
    ),
  );
  const provider = AnchorProvider.local(process.env.ANCHOR_PROVIDER_URL, {
    commitment: 'processed',
    preflightCommitment: 'processed',
  });

  return {
    multisig_address: config.multisig_address,
    multisig_ata: config.multisig_ata,
    anchor_provider: provider,
    keypair: keypair,
    squads_multisig_idl: config.squads_multisig_idl,
    provide_liquidity: {
      program_idl: config.provide_liquidity.program_idl,
      jlp_address: config.provide_liquidity.jlp_address,
      alt_table: config.provide_liquidity.alt_table,
      accounts: config.provide_liquidity.accounts,
      coins: new Map(
        config.provide_liquidity.coins.map((coin) => [coin.coin, coin]),
      ),
    },
  };
}
