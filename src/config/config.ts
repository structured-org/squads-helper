import { web3, AnchorProvider } from '@project-serum/anchor';
import { parse } from 'yaml';
import fs from 'fs';

type ConfigFile = {
  squads_multisig: {
    program_idl: string;
    multisig_address: string;
    vault_pda: string;
  };
  wormhole: {
    coins: Array<{
      coin: string;
      decimals: number;
      token_address: string;
    }>;
    chains: Array<{
      name: string;
      alt_table?: string;
      token_bridge_relayer: string;
      token_bridge: string;
      core_bridge: string;
      alt_accounts: Array<string>;
      remaining_accounts: Array<string>;
    }>;
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
    remaining_accounts: Array<string>;
    alt_accounts: Array<string>;
    coins: Array<{
      coin: 'WSOL' | 'USDC' | 'WETH' | 'USDT' | 'WBTC';
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

export type BaseApp = {
  anchorProvider: AnchorProvider;
  keypair: web3.Keypair;
};

export type SquadsMultisigApp = {
  programIdl: any;
  multisigAddress: web3.PublicKey;
  vaultPda: web3.PublicKey;
};

export type WormholeChain = {
  altTable?: web3.PublicKey;
  tokenBridgeRelayer: web3.PublicKey;
  tokenBridge: web3.PublicKey;
  coreBridge: web3.PublicKey;
  altAccounts: Array<web3.PublicKey>;
  remainingAccounts: Array<web3.PublicKey>;
};

export type WormholeToken = {
  token_address: web3.PublicKey;
  decimals: number;
};

export type WormholeApp = {
  coins: Map<string, WormholeToken>;
  chains: Map<string, WormholeChain>;
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

export type JupiterPerpsToken = {
  decimals: number;
  token_address: web3.PublicKey;
  input_accounts: JupiterPerpsInputAccounts;
};

export type JupiterPerpsApp = {
  programIdl: any;
  pool: web3.PublicKey;
  lpTokenMint: {
    decimals: number;
    coin: string;
    tokenAddress: web3.PublicKey;
  };
  perpetuals: web3.PublicKey;
  program: web3.PublicKey;
  altTable?: web3.PublicKey;
  remainingAccounts: Array<web3.PublicKey>;
  altAccounts: Array<web3.PublicKey>;
  coins: Map<string, JupiterPerpsToken>;
};

export function parseConfig(configPath: string): ConfigFile {
  const content = fs.readFileSync(configPath).toString();
  return parse(content);
}

export function getBaseApp(): BaseApp {
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
    keypair: keypair,
    anchorProvider: provider,
  };
}

export function getSquadsMultisigAppFromConfig(
  config: ConfigFile,
): SquadsMultisigApp {
  return {
    programIdl: JSON.parse(
      require('fs').readFileSync('./idl/squads_multisig.json', {
        encoding: 'utf-8',
      }),
    ),
    multisigAddress: new web3.PublicKey(
      config.squads_multisig.multisig_address,
    ),
    vaultPda: new web3.PublicKey(config.squads_multisig.vault_pda),
  };
}

export function getWormholeAppfromConfig(config: ConfigFile): WormholeApp {
  return {
    coins: new Map(
      config.wormhole.coins.map((coin) => [
        coin.coin,
        {
          token_address: new web3.PublicKey(coin.token_address),
          decimals: coin.decimals,
        },
      ]),
    ),
    chains: new Map(
      config.wormhole.chains.map((chain) => {
        const chainConfiguraion: WormholeChain = {
          altTable: chain.alt_table
            ? new web3.PublicKey(chain.alt_table)
            : undefined,
          tokenBridgeRelayer: new web3.PublicKey(chain.token_bridge_relayer),
          tokenBridge: new web3.PublicKey(chain.token_bridge),
          coreBridge: new web3.PublicKey(chain.core_bridge),
          remainingAccounts: chain.remaining_accounts.map(
            (account) => new web3.PublicKey(account),
          ),
          altAccounts: chain.alt_accounts.map(
            (account) => new web3.PublicKey(account),
          ),
        };
        return [chain.name, chainConfiguraion];
      }),
    ),
  };
}

export function getJupiterPerpsAppFromConfig(
  config: ConfigFile,
): JupiterPerpsApp {
  return {
    programIdl: JSON.parse(
      require('fs').readFileSync('./idl/perpetuals.json', {
        encoding: 'utf-8',
      }),
    ),
    lpTokenMint: {
      coin: config.jupiter_perps.lp_token_mint.coin,
      decimals: config.jupiter_perps.lp_token_mint.decimals,
      tokenAddress: new web3.PublicKey(
        config.jupiter_perps.lp_token_mint.token_address,
      ),
    },
    pool: new web3.PublicKey(config.jupiter_perps.pool),
    perpetuals: new web3.PublicKey(config.jupiter_perps.perpetuals),
    program: new web3.PublicKey(config.jupiter_perps.program),
    altTable: config.jupiter_perps.alt_table
      ? new web3.PublicKey(config.jupiter_perps.alt_table)
      : undefined,
    remainingAccounts: config.jupiter_perps.remaining_accounts.map(
      (address) => new web3.PublicKey(address),
    ),
    altAccounts: config.jupiter_perps.alt_accounts.map(
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
          lp_token_mint: new web3.PublicKey(coin.input_accounts.lp_token_mint),
          token_program: new web3.PublicKey(coin.input_accounts.token_program),
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
  };
}
