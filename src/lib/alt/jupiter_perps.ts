import { BaseApp, type JupiterPerpsApp } from '@config/config';
import { type Alt } from '.';
import { Logger } from 'pino';
import { web3 } from '@project-serum/anchor';

export async function createJupiterPerpsAltTableIfNotExist(
  logger: Logger,
  alt: Alt,
  baseApp: BaseApp,
  jupiterPerpsApp: JupiterPerpsApp,
) {
  const ty = 'Jupiter Perps';
  if (jupiterPerpsApp.altTable === undefined) {
    await alt.createAndFillAlt(jupiterPerpsApp, ty);
  } else {
    const lookupTableAccount = (
      await baseApp.anchorProvider.connection.getAddressLookupTable(
        new web3.PublicKey(jupiterPerpsApp.altTable!),
      )
    ).value;
    let expectedAccounts = [...jupiterPerpsApp.accounts];
    logger.info(`${ty} ALT Table Defined -- ${jupiterPerpsApp.altTable!}`);

    for (let i = 1; i <= lookupTableAccount.state.addresses.length; i += 1) {
      const lookupAddress = lookupTableAccount.state.addresses[i - 1];
      logger.info(
        `ALT Account ${i}/${lookupTableAccount.state.addresses.length} -- ${lookupAddress}`,
      );
      expectedAccounts = expectedAccounts.filter(
        (account) => account.toBase58() !== lookupAddress.toBase58(),
      );
    }
    if (expectedAccounts.length !== 0) {
      for (const remainingAccount of expectedAccounts) {
        logger.warn(`${ty} ALT missing -- ${remainingAccount}`);
      }
      logger.info(`${ty} Creating a new ALT`);
      await alt.createAndFillAlt(jupiterPerpsApp, ty);
      logger.info(`${ty} Using new ALT -- ${jupiterPerpsApp.altTable!}`);
    }
  }
}
