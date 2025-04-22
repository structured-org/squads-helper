import { getConfigState } from '@config/config';
import { Squads } from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { bignumber } from 'mathjs';
import { JLP_DENOM, JLP_PRECISION, Jupiter } from '@lib/jlp';
import { Alt } from '@lib/alt';
import { MultisigProvider } from '@lib/multisig_provider';
import { simulateAndBroadcast } from '@lib/helpers';

const logger = getLogger();
const state = getConfigState(process.env.CONFIG_PATH);
const jlp = new Jupiter(logger, state);
const squads = new Squads(logger, state);
const alt = new Alt(logger, state);
const multisigProvider = new MultisigProvider(logger, state, jlp, squads, alt);

async function main() {
  if (process.env.TOKEN_AMOUNT === undefined) {
    logger.error(
      "It's required to declare TOKEN_AMOUNT -- (DENOM_OUT=USDC TOKEN_AMOUNT=123JLP SLIPPAGE_TOLERANCE=0.01 npm run remove-liquidity)",
    );
    process.exit(-1);
  }
  if (process.env.SLIPPAGE_TOLERANCE === undefined) {
    logger.error(
      "It's required to declare SLIPPAGE_TOLERANCE -- (DENOM_OUT=USDC TOKEN_AMOUNT=123JLP SLIPPAGE_TOLERANCE=0.01 npm run remove-liquidity)",
    );
    process.exit(-1);
  }
  if (process.env.DENOM_OUT === undefined) {
    logger.error(
      "It's required to declare DENOM_OUT -- (DENOM_OUT=USDC TOKEN_AMOUNT=123JLP SLIPPAGE_TOLERANCE=0.01 npm run remove-liquidity)",
    );
    process.exit(-1);
  }
  logger.debug('Reading the config');
  const [, amount, denom] = process.env.TOKEN_AMOUNT.match(
    /^(\d+(?:\.\d+)?)([A-Z]+)$/,
  );
  if (denom !== JLP_DENOM) {
    logger.error(`Given coin should has JLP denom -- ${denom}`);
    process.exit(-1);
  }
  if (state.jupiter_perps.coins.get(process.env.DENOM_OUT) === undefined) {
    logger.error(
      `Given DENOM_OUT doesn't exist for the given config -- ${process.env.DENOM_OUT}`,
    );
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
    `Remove liquidity -- (DENOM_OUT=${process.env.DENOM_OUT} TOKEN_AMOUNT=${process.env.TOKEN_AMOUNT}, SLIPPAGE_TOLERANCE=${process.env.SLIPPAGE_TOLERANCE})`,
  );
  const tx = await multisigProvider.createRemoveLiquidityProposalTx(
    Number(process.env.SLIPPAGE_TOLERANCE),
    process.env.DENOM_OUT,
    {
      denom: denom,
      amount: bignumber(amount),
      precision: JLP_PRECISION,
    },
  );
  await simulateAndBroadcast(
    state.anchor_provider,
    tx,
    'liquidity removal propopsal',
    logger,
    state.keypair,
  );
}

main();
