import { getConfig } from '@config/config';
import { Squads } from '@actions/squads/squads';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';

import { bignumber } from 'mathjs';
import { Jupiter } from '@actions/jlp';

const logger = getLogger();
const config = getConfig(process.env.CONFIG_PATH);
const jlp = new Jupiter(logger, config);
const squads = new Squads(logger, config);

async function main() {
  const lookupTableAccount = (
    await config.anchor_provider.connection.getAddressLookupTable(
      new web3.PublicKey(config.jupiter_perps.alt_table!),
    )
  ).value;
  const removeLiquidityIx = await jlp.removeLiquidityIx(
    config.squads_multisig.vault_pda,
    {
      denom: 'JLP',
      amount: bignumber(1000000),
      precision: config.jupiter_perps.lp_token_mint.decimals,
    },
    'WETH',
    0.01,
  );
  const createBatchIx = await squads.createBatchIx();
  const createProposalIx = await squads.createProposalIx();
  const addInstructionIx = await squads.batchAddIxV0(
    removeLiquidityIx,
    lookupTableAccount,
  );
  const proposalActivateIx = await squads.proposalActivateIx();
  const proposalApproveIx = await squads.proposalApproveIx();
  const tx = new web3.Transaction().add(
    createBatchIx,
    createProposalIx,
    addInstructionIx,
    proposalActivateIx,
    proposalApproveIx,
  );
  console.log(await config.anchor_provider.simulate(tx, [config.keypair]));
  //   console.log(
  //     await config.anchor_provider.sendAndConfirm(tx, [config.keypair]),
  //   );
}

main();
