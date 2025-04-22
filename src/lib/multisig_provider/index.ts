import { Config } from '@config/config';
import { Alt } from '@lib/alt';
import { Jupiter } from '@lib/jlp';
import { Squads } from '@lib/squads';
import { Logger } from 'pino';
import { web3 } from '@project-serum/anchor';
import { Coin } from '@lib/coin';
import { bignumber } from 'mathjs';

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

  async createProvideLiquidityProposalTx(
    slippageTolerance: number,
    coin: Coin,
  ): Promise<web3.Transaction> {
    const lookupTableAccount = (
      await this.config.anchor_provider.connection.getAddressLookupTable(
        new web3.PublicKey(this.config.jupiter_perps.alt_table!),
      )
    ).value;
    const addLiquidityIx = await this.jupiter.provideLiquidityIx(
      this.config.squads_multisig.vault_pda,
      {
        denom: coin.denom,
        amount: bignumber(coin.amount),
        precision: coin.precision,
      },
      slippageTolerance,
    );
    const createBatchIx = await this.squads.createBatchIx();
    const createProposalIx = await this.squads.createProposalIx();
    const addInstructionIx = await this.squads.batchAddIxV0(
      addLiquidityIx,
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
}
