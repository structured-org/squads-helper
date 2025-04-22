import { Config } from '@config/config';
import { Alt } from '@lib/alt';
import { Jupiter } from '@lib/jlp';
import { Squads } from '@lib/squads';
import { Logger } from 'pino';
import { web3 } from '@project-serum/anchor';
import { Coin } from '@lib/coin';
import { bignumber } from 'mathjs';
import { JLP_DENOM } from '@lib/jlp';

export class MultisigProvider {
  private logger: Logger;
  private config: Config;
  private jupiter: Jupiter;
  private squads: Squads;
  private alt: Alt;

  constructor(
    logger: Logger,
    config: Config,
    jupiter: Jupiter,
    squads: Squads,
    alt: Alt,
  ) {
    this.logger = logger;
    this.config = config;
    this.jupiter = jupiter;
    this.squads = squads;
    this.alt = alt;
  }

  private async createProposalTx(
    ix: web3.TransactionInstruction,
  ): Promise<web3.Transaction> {
    const lookupTableAccount = (
      await this.config.anchor_provider.connection.getAddressLookupTable(
        new web3.PublicKey(this.config.jupiter_perps.alt_table!),
      )
    ).value;
    const createBatchIx = await this.squads.createBatchIx();
    const createProposalIx = await this.squads.createProposalIx();
    const addInstructionIx = await this.squads.batchAddIxV0(
      ix,
      lookupTableAccount,
    );
    const proposalActivateIx = await this.squads.proposalActivateIx();
    const proposalApproveIx = await this.squads.proposalApproveIx();
    const tx = new web3.Transaction().add(
      createBatchIx,
      createProposalIx,
      addInstructionIx,
      proposalActivateIx,
      proposalApproveIx,
    );
    return tx;
  }

  async createProvideLiquidityProposalTx(
    slippageTolerance: number,
    coin: Coin,
  ): Promise<web3.Transaction> {
    const addLiquidityIx = await this.jupiter.provideLiquidityIx(
      this.config.squads_multisig.vault_pda,
      {
        denom: coin.denom,
        amount: bignumber(coin.amount),
        precision: coin.precision,
      },
      slippageTolerance,
    );
    return await this.createProposalTx(addLiquidityIx);
  }

  async createRemoveLiquidityProposalTx(
    slippageTolerance: number,
    denomOut: string,
    coin: Coin,
  ): Promise<web3.Transaction> {
    if (coin.denom !== JLP_DENOM) {
      throw `Given denom doesn't equal ${JLP_DENOM}`;
    }

    const removeLiquidityIx = await this.jupiter.relativeRemoveLiquidityIx(
      this.config.squads_multisig.vault_pda,
      {
        denom: coin.denom,
        amount: bignumber(coin.amount),
        precision: coin.precision,
      },
      denomOut,
      slippageTolerance,
    );
    return await this.createProposalTx(removeLiquidityIx);
  }

  async createRemoveLiquidityAbsoluteProposalTx(
    absoluteSlippageTolerance: number,
    denomOut: string,
    coin: Coin,
  ): Promise<web3.Transaction> {
    if (coin.denom !== JLP_DENOM) {
      throw `Given denom doesn't equal ${JLP_DENOM}`;
    }

    const removeLiquidityIx = await this.jupiter.absoluteRemoveLiquidityIx(
      this.config.squads_multisig.vault_pda,
      {
        denom: coin.denom,
        amount: bignumber(coin.amount),
        precision: coin.precision,
      },
      denomOut,
      absoluteSlippageTolerance,
    );
    return await this.createProposalTx(removeLiquidityIx);
  }
}
