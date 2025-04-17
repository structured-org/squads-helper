import { getConfig } from '@config/config';
import { prepareRawInstruction } from '@actions/provide_liquidity';
import {
  createProposalRawInstruction,
  createBatchRawInstruction,
  batchAddRawInstructionV0,
  proposalActivateRawInstruction,
  proposalApproveRawInstruction,
} from '@actions/create_proposal/create_proposal';
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
  const provideLiquidityIx = await jlp.provideLiquidityIx({
    denom: 'USDC',
    amount: bignumber(123),
    precision: 6,
  });
  config.anchor_provider.connection.simulateTransaction(
    new web3.Transaction().add(provideLiquidityIx),
    [config.keypair],
  );
}

main();
