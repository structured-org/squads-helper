import { getConfig } from '@config/config';
import { Squads } from '@lib/squads';
import { Alt } from '@lib/alt';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { bignumber } from 'mathjs';
import { Jupiter } from '@lib/jlp';
import { simulateAndBroadcast } from '@lib/helpers';

const logger = getLogger();
const config = getConfig(process.env.CONFIG_PATH);
const jlp = new Jupiter(logger, config);
const squads = new Squads(logger, config);
const alt = new Alt(logger, config);

async function main() {
  if (process.env.TOKEN_AMOUNT === undefined) {
    logger.error(
      "It's required to declare TOKEN_AMOUNT -- (TOKEN_AMOUNT=123USDC SLIPPAGE_TOLERANCE=0.01 npm run add-liquidity)",
    );
    process.exit(-1);
  }
  if (process.env.SLIPPAGE_TOLERANCE === undefined) {
    logger.error(
      "It's required to declare SLIPPAGE_TOLERANCE -- (TOKEN_AMOUNT=123USDC SLIPPAGE_TOLERANCE=0.01 npm run add-liquidity)",
    );
    process.exit(-1);
  }
  logger.debug('Reading the config');
  const config = getConfig(process.env.CONFIG_PATH);
  const [, amount, denom] = process.env.TOKEN_AMOUNT.match(
    /^(\d+(?:\.\d+)?)([A-Z]+)$/,
  );
  if (config.jupiter_perps.coins.get(denom) === undefined) {
    logger.error(`No such a coin described in the config -- ${denom}`);
    process.exit(-1);
  }

  // We need to have ALT for further addLiquidity2 instruction contraction
  if (config.jupiter_perps.alt_table === undefined) {
    const createTable = await alt.createTable();
    config.jupiter_perps.alt_table = new web3.PublicKey(
      createTable.lookupTableAddress.toBase58(),
    );
    await simulateAndBroadcast(
      config.anchor_provider,
      createTable.tx,
      'table creation',
      logger,
      config.keypair,
    );
  } else {
    logger.info(`ALT table defined -- ${config.jupiter_perps.alt_table!}`);
  }
  const lookupTableAccount = (
    await config.anchor_provider.connection.getAddressLookupTable(
      new web3.PublicKey(config.jupiter_perps.alt_table!),
    )
  ).value;
  const addLiquidityIx = await jlp.provideLiquidityIx(
    config.squads_multisig.vault_pda,
    {
      denom: denom,
      amount: bignumber(amount),
      precision: config.jupiter_perps.coins.get(denom)!.decimals,
    },
    Number(process.env.SLIPPAGE_TOLERANCE),
  );
  const createBatchIx = await squads.createBatchIx();
  const createProposalIx = await squads.createProposalIx();
  const addInstructionIx = await squads.batchAddIxV0(
    addLiquidityIx,
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
  logger.info(
    `Provide liquidity -- (TOKEN_AMOUNT=${process.env.TOKEN_AMOUNT}, SLIPPAGE_TOLERANCE=${process.env.SLIPPAGE_TOLERANCE})`,
  );
  await simulateAndBroadcast(
    config.anchor_provider,
    tx,
    'liquidity provision propopsal',
    logger,
    config.keypair,
  );
}

main();
