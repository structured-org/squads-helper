import { getConfigState } from '@config/config';
import { Squads } from '@lib/squads';
import { Alt } from '@lib/alt';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { Jupiter } from '@lib/jlp';
import { simulateAndBroadcast } from '@lib/helpers';
import { MultisigProvider } from '@lib/multisig_provider';
import { bignumber } from 'mathjs';

const logger = getLogger();
const state = getConfigState(process.env.CONFIG_PATH);
const jlp = new Jupiter(logger, state);
const squads = new Squads(logger, state);
const alt = new Alt(logger, state);
const multisigProvider = new MultisigProvider(logger, state, jlp, squads, alt);

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
  const [, amount, denom] = process.env.TOKEN_AMOUNT.match(
    /^(\d+(?:\.\d+)?)([A-Z]+)$/,
  );
  if (state.jupiter_perps.coins.get(denom) === undefined) {
    logger.error(`No such a coin described in the config -- ${denom}`);
    process.exit(-1);
  }

  // We need to have ALT for further addLiquidity2 instruction contraction
  if (state.jupiter_perps.alt_table === undefined) {
    const createTable = await alt.createTable();
    state.jupiter_perps.alt_table = new web3.PublicKey(
      createTable.lookupTableAddress.toBase58(),
    );
    await simulateAndBroadcast(
      state.anchor_provider,
      createTable.tx,
      'table creation',
      logger,
      state.keypair,
    );
  } else {
    logger.info(`ALT table defined -- ${state.jupiter_perps.alt_table!}`);
  }

  logger.info(
    `Provide liquidity -- (TOKEN_AMOUNT=${process.env.TOKEN_AMOUNT}, SLIPPAGE_TOLERANCE=${process.env.SLIPPAGE_TOLERANCE})`,
  );
  const tx = await multisigProvider.createAddLiquidityProposalTx(
    Number(process.env.SLIPPAGE_TOLERANCE),
    {
      denom: denom,
      amount: bignumber(amount),
      precision: state.jupiter_perps.coins.get(denom)!.decimals,
    },
  );
  await simulateAndBroadcast(
    state.anchor_provider,
    tx,
    'liquidity provision propopsal',
    logger,
    state.keypair,
  );
}

main();
