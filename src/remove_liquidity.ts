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
import { JLP_DENOM, JLP_PRECISION, JupiterPerps } from '@lib/jlp';
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
  if (jupiterPerps.app.coins.get(process.env.DENOM_OUT) === undefined) {
    logger.error(
      `Given DENOM_OUT doesn't exist for the given config -- ${process.env.DENOM_OUT}`,
    );
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
    const lookupTableAccount = (
      await baseApp.anchorProvider.connection.getAddressLookupTable(
        new web3.PublicKey(jupiterPerps.app.altTable!),
      )
    ).value;
    for (let i = 1; i <= lookupTableAccount.state.addresses.length; i += 1) {
      logger.info(
        `ALT account ${i}/${lookupTableAccount.state.addresses.length} -- ${lookupTableAccount.state.addresses[i - 1]}`,
      );
    }
  }

  logger.info(
    `Remove liquidity -- (DENOM_OUT=${process.env.DENOM_OUT}, TOKEN_AMOUNT=${process.env.TOKEN_AMOUNT}, SLIPPAGE_TOLERANCE=${process.env.SLIPPAGE_TOLERANCE})`,
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
    baseApp.anchorProvider,
    tx,
    'liquidity removal propopsal',
    logger,
    baseApp.keypair,
  );
}

main();
