import { JupiterPerps } from '@lib/jlp';
import { SquadsMultisig } from '@lib/squads';
import { Logger } from 'pino';
import { web3 } from '@project-serum/anchor';
import { Coin } from '@lib/coin';
import { bignumber } from 'mathjs';
import { JLP_DENOM } from '@lib/jlp';
import { type BaseApp } from '@config/config';
import { WormholeEthereum } from '@lib/wormhole';

export class MultisigProvider {
  private logger: Logger;
  private jupiterPerps: JupiterPerps;
  private squadsMultisig: SquadsMultisig;
  private baseApp: BaseApp;
  private wormholeEthereum: WormholeEthereum;

  constructor(
    logger: Logger,
    jupiterPerps: JupiterPerps,
    squadsMultisig: SquadsMultisig,
    baseApp: BaseApp,
    wormholeEthereum: WormholeEthereum,
  ) {
    this.logger = logger;
    this.jupiterPerps = jupiterPerps;
    this.squadsMultisig = squadsMultisig;
    this.baseApp = baseApp;
    this.wormholeEthereum = wormholeEthereum;
  }

  private async createProposalTx(
    ix: web3.TransactionInstruction,
    alt: web3.PublicKey,
  ): Promise<web3.Transaction> {
    const lookupTableAccount = (
      await this.baseApp.anchorProvider.connection.getAddressLookupTable(
        new web3.PublicKey(alt),
      )
    ).value;
    const createBatchIx = await this.squadsMultisig.createBatchIx();
    const createProposalIx = await this.squadsMultisig.createProposalIx();
    const addInstructionIx = await this.squadsMultisig.batchAddIxV0(
      ix,
      lookupTableAccount,
    );
    const proposalActivateIx = await this.squadsMultisig.proposalActivateIx();
    const tx = new web3.Transaction().add(
      createBatchIx,
      createProposalIx,
      addInstructionIx,
      proposalActivateIx,
    );
    return tx;
  }

  async createAddLiquidityProposalTx(
    slippageTolerance: number,
    coin: Coin,
  ): Promise<web3.Transaction> {
    const addLiquidityIx = await this.jupiterPerps.relativeAddLiquidityIx(
      this.squadsMultisig.app.vaultPda,
      {
        denom: coin.denom,
        amount: bignumber(coin.amount),
        precision: coin.precision,
      },
      slippageTolerance,
    );
    return await this.createProposalTx(
      addLiquidityIx,
      this.jupiterPerps.app.altTable,
    );
  }

  async createRemoveLiquidityProposalTx(
    slippageTolerance: number,
    denomOut: string,
    coin: Coin,
  ): Promise<web3.Transaction> {
    if (coin.denom !== JLP_DENOM) {
      throw `Given denom doesn't equal ${JLP_DENOM}`;
    }

    const removeLiquidityIx = await this.jupiterPerps.relativeRemoveLiquidityIx(
      this.squadsMultisig.app.vaultPda,
      {
        denom: coin.denom,
        amount: bignumber(coin.amount),
        precision: coin.precision,
      },
      denomOut,
      slippageTolerance,
    );
    return await this.createProposalTx(
      removeLiquidityIx,
      this.jupiterPerps.app.altTable,
    );
  }

  async wormholeTransferEthereum(
    token: Coin,
    receiver: string,
  ): Promise<web3.Transaction> {
    const transferWrappedIx =
      await this.wormholeEthereum.transferTokensEthereum(
        this.squadsMultisig.app.vaultPda,
        receiver,
        token,
      );

    return await this.createProposalTx(
      transferWrappedIx,
      this.wormholeEthereum.app.chains.get('Ethereum').altTable!,
    );
  }
}
