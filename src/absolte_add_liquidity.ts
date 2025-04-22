import { getConfig } from '@config/config';
import { Squads } from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { bignumber } from 'mathjs';
import { Jupiter } from '@lib/jlp';
import { Alt } from '@lib/alt';
import { MultisigProvider } from '@lib/multisig_provider';
import { simulateAndBroadcast } from '@lib/helpers';

const logger = getLogger();
const config = getConfig(process.env.CONFIG_PATH);
const jlp = new Jupiter(logger, config);
const squads = new Squads(logger, config);
const alt = new Alt(logger, config);
const multisigProvider = new MultisigProvider(logger, config, jlp, squads, alt);

async function main() {
  if (process.env.TOKEN_AMOUNT === undefined) {
    logger.error(
      "It's required to declare TOKEN_AMOUNT -- (DENOM_OUT=USDC TOKEN_AMOUNT=123JLP ABSOLUTE_SLIPPAGE_TOLERANCE=1 npm run absolute-add-liquidity)",
    );
    process.exit(-1);
  }
  if (process.env.ABSOLUTE_SLIPPAGE_TOLERANCE === undefined) {
    logger.error(
      "It's required to declare ABSOLUTE_SLIPPAGE_TOLERANCE -- (DENOM_OUT=USDC TOKEN_AMOUNT=123JLP ABSOLUTE_SLIPPAGE_TOLERANCE=1 npm run absolute-add-liquidity)",
    );
    process.exit(-1);
  }
  if (process.env.DENOM_OUT === undefined) {
    logger.error(
      "It's required to declare DENOM_OUT -- (DENOM_OUT=USDC TOKEN_AMOUNT=123JLP ABSOLUTE_SLIPPAGE_TOLERANCE=1 npm run absolute-add-liquidity)",
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

  logger.info(
    `Absolute provide liquidity -- (TOKEN_AMOUNT=${process.env.TOKEN_AMOUNT}, ABSOLUTE_SLIPPAGE_TOLERANCE=${process.env.ABSOLUTE_SLIPPAGE_TOLERANCE})`,
  );
  const tx = await multisigProvider.createAddLiquidityAbsoluteProposalTx(
    Number(process.env.ABSOLUTE_SLIPPAGE_TOLERANCE),
    {
      denom: denom,
      amount: bignumber(amount),
      precision: config.jupiter_perps.coins.get(denom)!.decimals,
    },
  );
  await simulateAndBroadcast(
    config.anchor_provider,
    tx,
    'absolute liquidity provision propopsal',
    logger,
    config.keypair,
  );
}

main();
