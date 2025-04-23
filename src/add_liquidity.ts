import {
  getBaseApp,
  parseConfig,
  getJupiterPerpsAppFromConfig,
  getSquadsMultisigAppFromConfig,
} from '@config/config';
import { SquadsMultisig } from '@lib/squads';
import { Alt } from '@lib/alt';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { JupiterPerps } from '@lib/jlp';
import { simulateAndBroadcast } from '@lib/helpers';
import { MultisigProvider } from '@lib/multisig_provider';
import { bignumber } from 'mathjs';

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
  if (jupiterPerps.app.coins.get(denom) === undefined) {
    logger.error(`No such a coin described in the config -- ${denom}`);
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
    `Provide liquidity -- (TOKEN_AMOUNT=${process.env.TOKEN_AMOUNT}, SLIPPAGE_TOLERANCE=${process.env.SLIPPAGE_TOLERANCE})`,
  );
  const tx = await multisigProvider.createAddLiquidityProposalTx(
    Number(process.env.SLIPPAGE_TOLERANCE),
    {
      denom: denom,
      amount: bignumber(amount),
      precision: jupiterPerps.app.coins.get(denom)!.decimals,
    },
  );
  await simulateAndBroadcast(
    baseApp.anchorProvider,
    tx,
    'liquidity provision propopsal',
    logger,
    baseApp.keypair,
  );
}

main();
