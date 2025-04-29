import { type JupiterPerpsApp, type BaseApp } from '@config/config';
import { type Alt } from '.';
import { simulateAndBroadcast } from '@lib/helpers';
import { web3 } from '@project-serum/anchor';
import { type Logger } from 'pino';

export async function createJupiterPerpsAltTableIfNotExist(
  alt: Alt,
  baseApp: BaseApp,
  jupiterPerpsApp: JupiterPerpsApp,
  logger: Logger,
) {
  if (jupiterPerpsApp.altTable === undefined) {
    const createTable = await alt.createTable(jupiterPerpsApp.accounts);
    jupiterPerpsApp.altTable = new web3.PublicKey(
      createTable.lookupTableAddress.toBase58(),
    );
    await simulateAndBroadcast(
      baseApp.anchorProvider,
      createTable.tx,
      'jupiter-perps alt creation',
      logger,
      baseApp.keypair,
    );
  } else {
    logger.info(`ALT Table Defined -- ${jupiterPerpsApp.altTable!}`);
    const lookupTableAccount = (
      await baseApp.anchorProvider.connection.getAddressLookupTable(
        new web3.PublicKey(jupiterPerpsApp.altTable!),
      )
    ).value;
    for (let i = 1; i <= lookupTableAccount.state.addresses.length; i += 1) {
      logger.info(
        `ALT Account ${i}/${lookupTableAccount.state.addresses.length} -- ${lookupTableAccount.state.addresses[i - 1]}`,
      );
    }
  }
}
