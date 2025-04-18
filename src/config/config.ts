import { web3, AnchorProvider } from '@project-serum/anchor';
import { parse } from 'yaml';
import fs from 'fs';

type ConfigFile = {
  squads_multisig: {
    program_idl: string;
    multisig_address: string;
    vault_pda: string;
  };
  jupiter_perps: {
    program_idl: string;
    program: string;
    alt_table?: string;
    pool: string;
    perpetuals: string;
    lp_token_mint: {
      decimals: number;
      coin: string;
      token_address: string;
    };
    accounts: Array<string>;
    coins: Array<{
      coin: 'WSOL' | 'USDC' | 'WETH' | 'USDT';
      decimals: number;
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
    }>;
  };
};

type JupiterPerpsInputAccounts = {
  transfer_authority: web3.PublicKey;
  perpetuals: web3.PublicKey;
  pool: web3.PublicKey;
  custody: web3.PublicKey;
  custody_doves_price_account: web3.PublicKey;
  custody_pythnet_price_account: web3.PublicKey;
  custody_token_account: web3.PublicKey;
  lp_token_mint: web3.PublicKey;
  token_program: web3.PublicKey;
  event_authority: web3.PublicKey;
  program: web3.PublicKey;
};

type JupiterPerpsToken = {
  decimals: number;
  token_address: web3.PublicKey;
  input_accounts: JupiterPerpsInputAccounts;
};

export type Config = {
  anchor_provider: AnchorProvider;
  keypair: web3.Keypair;
  squads_multisig: {
    program_idl: any;
    multisig_address: web3.PublicKey;
    vault_pda: web3.PublicKey;
  };
  jupiter_perps: {
    program_idl: any;
    pool: web3.PublicKey;
    lp_token_mint: {
      decimals: number;
      coin: string;
      token_address: web3.PublicKey;
    };
    perpetuals: web3.PublicKey;
    program: web3.PublicKey;
    alt_table?: web3.PublicKey;
    accounts: web3.PublicKey[];
    coins: Map<string, JupiterPerpsToken>;
  };
};

function parseConfig(configPath: string): ConfigFile {
  const content = fs.readFileSync(configPath).toString();
  return parse(content);
}

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
    commitment: 'confirmed',
    skipPreflight: true,
  });

  return {
    anchor_provider: provider,
    keypair: keypair,
    squads_multisig: {
      program_idl: JSON.parse(
        require('fs').readFileSync('./idl/squads_multisig.json', {
          encoding: 'utf-8',
        }),
      ),
      multisig_address: new web3.PublicKey(
        config.squads_multisig.multisig_address,
      ),
      vault_pda: new web3.PublicKey(config.squads_multisig.vault_pda),
    },
    jupiter_perps: {
      program_idl: JSON.parse(
        require('fs').readFileSync('./idl/perpetuals.json', {
          encoding: 'utf-8',
        }),
      ),
      lp_token_mint: {
        coin: config.jupiter_perps.lp_token_mint.coin,
        decimals: config.jupiter_perps.lp_token_mint.decimals,
        token_address: new web3.PublicKey(
          config.jupiter_perps.lp_token_mint.token_address,
        ),
      },
      pool: new web3.PublicKey(config.jupiter_perps.pool),
      perpetuals: new web3.PublicKey(config.jupiter_perps.perpetuals),
      program: new web3.PublicKey(config.jupiter_perps.program),
      alt_table: config.jupiter_perps.alt_table
        ? new web3.PublicKey(config.jupiter_perps.alt_table)
        : undefined,
      accounts: config.jupiter_perps.accounts.map(
        (address) => new web3.PublicKey(address),
      ),
      coins: new Map(
        config.jupiter_perps.coins.map((coin) => {
          const inputAccounts: JupiterPerpsInputAccounts = {
            transfer_authority: new web3.PublicKey(
              coin.input_accounts.transfer_authority,
            ),
            perpetuals: new web3.PublicKey(coin.input_accounts.perpetuals),
            pool: new web3.PublicKey(coin.input_accounts.pool),
            custody: new web3.PublicKey(coin.input_accounts.custody),
            custody_doves_price_account: new web3.PublicKey(
              coin.input_accounts.custody_doves_price_account,
            ),
            custody_pythnet_price_account: new web3.PublicKey(
              coin.input_accounts.custody_pythnet_price_account,
            ),
            custody_token_account: new web3.PublicKey(
              coin.input_accounts.custody_token_account,
            ),
            lp_token_mint: new web3.PublicKey(
              coin.input_accounts.lp_token_mint,
            ),
            token_program: new web3.PublicKey(
              coin.input_accounts.token_program,
            ),
            event_authority: new web3.PublicKey(
              coin.input_accounts.event_authority,
            ),
            program: new web3.PublicKey(coin.input_accounts.program),
          };

          const token: JupiterPerpsToken = {
            decimals: coin.decimals,
            token_address: new web3.PublicKey(coin.token_address),
            input_accounts: inputAccounts,
          };
          return [coin.coin, token];
        }),
      ),
    },
  };
}
