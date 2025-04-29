import type {
  BaseApp,
  WormholeApp,
  WormholeChain,
  WormholeToken,
} from '@config/config';
import {
  createTransferWrappedTokensWithRelayInstructionOffCurve,
  getSolanaAutomaticTokenBridge,
} from './internal';
import { Logger } from 'pino';
import { type Coin } from '@lib/coin';
import { UniversalAddress, Wormhole } from '@wormhole-foundation/sdk';
import { SolanaAddress } from '@wormhole-foundation/sdk-solana';
import { web3 } from '@project-serum/anchor';
import { SolanaAutomaticTokenBridge } from '@wormhole-foundation/sdk-solana-tokenbridge';

export class WormholeEthereum {
  private logger: Logger;
  private baseApp: BaseApp;
  private wormholeApp: WormholeApp;
  private automaticTokenBridge: SolanaAutomaticTokenBridge<'Mainnet', 'Solana'>;

  constructor(logger: Logger, baseApp: BaseApp, wormholeApp: WormholeApp) {
    this.logger = logger;
    this.baseApp = baseApp;
    this.wormholeApp = wormholeApp;

    const wormholeEthereumChain = wormholeApp.chains.get('Ethereum');
    this.automaticTokenBridge = getSolanaAutomaticTokenBridge(
      baseApp.anchorProvider,
      {
        tokenBridge: wormholeEthereumChain.tokenBridge.toBase58(),
        tokenBridgeRelayer: wormholeEthereumChain.tokenBridgeRelayer.toBase58(),
        coreBridge: wormholeEthereumChain.coreBridge.toBase58(),
      },
    );
  }

  get app(): WormholeApp {
    return this.wormholeApp;
  }

  async transferTokensEthereum(
    sender: web3.PublicKey,
    recipient: string,
    token: Coin,
    feeTolerance?: number,
  ): Promise<web3.TransactionInstruction> {
    if (this.wormholeApp.coins.has(token.denom) === false) {
      this.logger.error(`${token.denom} In Wormhole Config Doesn't Exist`);
      return;
    }
    const wormholeChain: WormholeChain =
      this.wormholeApp.chains.get('Ethereum');
    const wormholeToken: WormholeToken = this.wormholeApp.coins.get(
      token.denom,
    );

    const relayerFee = await this.automaticTokenBridge.getRelayerFee(
      'Ethereum',
      Wormhole.tokenId('Solana', wormholeToken.token_address.toBase58())
        .address,
    );
    if (relayerFee >= feeTolerance) {
      this.logger.error(`${relayerFee} >= feeTolerance`);
      return;
    }

    this.logger.info(`Relayer Fee -- ${relayerFee}`);
    this.logger.info(
      `Token Bridge Relayer -- ${wormholeChain.tokenBridgeRelayer}`,
    );
    this.logger.info(`Token Bridge -- ${wormholeChain.tokenBridge}`);
    this.logger.info(`Core Bridge -- ${wormholeChain.coreBridge}`);
    this.logger.info(`From -- ${sender}`);
    this.logger.info(`To -- ${recipient}`);
    this.logger.info(`Initial Amount -- ${token.amount.toString()}`);
    this.logger.info(
      `Actual Amount -- ${BigInt(token.amount.toString()) - relayerFee}`,
    );

    return await createTransferWrappedTokensWithRelayInstructionOffCurve(
      this.baseApp.anchorProvider.connection,
      new web3.PublicKey(wormholeChain.tokenBridgeRelayer),
      sender,
      new web3.PublicKey(wormholeChain.tokenBridge),
      new web3.PublicKey(wormholeChain.coreBridge),
      new SolanaAddress(wormholeToken.token_address).unwrap(),
      BigInt(token.amount.toString()),
      0n,
      new UniversalAddress(recipient, 'hex')
        .toUniversalAddress()
        .toUint8Array(),
      'Ethereum',
      0,
    );
  }
}
