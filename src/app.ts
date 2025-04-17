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

import {
  getPoolAum,
  getLpTokenAmount,
  getVirtualPrice,
} from '@actions/jlp/virtual_price';
import { GetTokenSupplyApi } from '@solana/kit';

import { bignumber } from 'mathjs';
import { Jupiter } from '@actions/jlp';

const logger = getLogger();
const config = getConfig(process.env.CONFIG_PATH);

async function main() {
  const jlp = new Jupiter(logger, config);
  console.log(
    await jlp.getLpTokenAmount(
      {
        denom: 'USDC',
        amount: bignumber(1000000),
        precision: 6,
      },
      0.01,
    ),
  );
}

main();
