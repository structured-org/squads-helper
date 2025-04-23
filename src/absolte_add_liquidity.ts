import {
  getBaseApp,
  parseConfig,
  getJupiterPerpsAppFromConfig,
  getSquadsMultisigAppFromConfig,
} from '@config/config';
import { SquadsMultisig } from '@lib/squads';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { bignumber } from 'mathjs';
import { JupiterPerps } from '@lib/jlp';
import { Alt } from '@lib/alt';
import { MultisigProvider } from '@lib/multisig_provider';
import { simulateAndBroadcast } from '@lib/helpers';

const logger = getLogger();
const config = parseConfig(process.env.CONFIG_PATH);
const baseApp = getBaseApp();
const jupiterPerpsApp = getJupiterPerpsAppFromConfig(config);
const squadsMultisigApp = getSquadsMultisigAppFromConfig(config);
const jupiterPerps = new JupiterPerps(logger, baseApp, jupiterPerpsApp);
const squadsMultisig = new SquadsMultisig(logger, baseApp, squadsMultisigApp);
const alt = new Alt(logger, baseApp);
const multisigProvider = new MultisigProvider(
  logger,
  jupiterPerps,
  squadsMultisig,
  baseApp,
);

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
  logger.debug('Reading the config');
  const [, amount, denom] = process.env.TOKEN_AMOUNT.match(
    /^(\d+(?:\.\d+)?)([A-Z]+)$/,
  );
  if (jupiterPerps.app.coins.get(denom) === undefined) {
    logger.error(`No such a coin described in the config -- ${denom}`);
    process.exit(-1);
  }
  if (Number(process.env.ABSOLUTE_SLIPPAGE_TOLERANCE) % 1 !== 0) {
    logger.error(`ABSOLUTE_SLIPPAGE_TOLERANCE is supposed to be an integer`);
    process.exit(-1);
  }

  // We need to have ALT for further addLiquidity2 instruction contraction
  if (jupiterPerps.app.altTable === undefined) {
    const createTable = await alt.createTable(jupiterPerps.app.accounts);
    jupiterPerps.app.altTable = new web3.PublicKey(
      createTable.lookupTableAddress.toBase58(),
    );
    await simulateAndBroadcast(
      baseApp.anchorProvider,
      createTable.tx,
      'table creation',
      logger,
      baseApp.keypair,
    );
  } else {
    logger.info(`ALT table defined -- ${jupiterPerps.app.altTable!}`);
  }

  logger.info(
    `Absolute provide liquidity -- (TOKEN_AMOUNT=${process.env.TOKEN_AMOUNT}, ABSOLUTE_SLIPPAGE_TOLERANCE=${process.env.ABSOLUTE_SLIPPAGE_TOLERANCE})`,
  );
  const tx = await multisigProvider.createAddLiquidityAbsoluteProposalTx(
    Number(process.env.ABSOLUTE_SLIPPAGE_TOLERANCE),
    {
      denom: denom,
      amount: bignumber(amount),
      precision: jupiterPerps.app.coins.get(denom)!.decimals,
    },
  );
  await simulateAndBroadcast(
    baseApp.anchorProvider,
    tx,
    'absolute liquidity provision propopsal',
    logger,
    baseApp.keypair,
  );
}

main();
