import { getConfig } from '@config/config';
import { Squads } from '@actions/squads/squads';
import {
  useAltRawInstruction,
  registerAltRawInstruction,
  UseAltRawInstruction,
} from '@actions/alt';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { confirmTransaction } from '@solana-developers/helpers';
import { GetTokenSupplyApi } from '@solana/kit';

import { bignumber } from 'mathjs';
import { Jupiter } from '@actions/jlp';

const logger = getLogger();
const config = getConfig(process.env.CONFIG_PATH);

async function main() {
  const jlp = new Jupiter(logger, config);
  const squads = new Squads(logger, config);
  const provideLiquidityIx = await jlp.provideLiquidityIx(
    config.squads_multisig.vault_pda,
    {
      denom: 'USDC',
      amount: bignumber(123),
      precision: 6,
    },
    0.01,
  );
  const lookupTableAccount = (
    await config.anchor_provider.connection.getAddressLookupTable(
      new web3.PublicKey(config.jupiter_perps.alt_table!),
    )
  ).value;
  const createBatchIx = await squads.createBatchIx();
  const createProposalIx = await squads.createProposalIx();
  const batchAddIx = await squads.batchAddIxV0(
    provideLiquidityIx,
    lookupTableAccount,
  );
  const proposalApproveIx = await squads.proposalApproveIx();
  const proposalActivateIx = await squads.proposalActivateIx();
  const res = await config.anchor_provider.connection.simulateTransaction(
    new web3.Transaction().add(
      createBatchIx,
      createProposalIx,
      batchAddIx,
      proposalActivateIx,
      proposalApproveIx,
    ),
    [config.keypair],
  );
  console.log(res);
}

main();
