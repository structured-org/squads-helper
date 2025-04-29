import { type BaseApp } from '@config/config';
import { type Alt } from '.';
import { type Wormhole } from '@lib/wormhole';
import { type Logger } from 'pino';
import { web3 } from '@project-serum/anchor';
import { simulateAndBroadcast } from '@lib/helpers';

export async function createWormholeAltTablesIfNotExist(
  alt: Alt,
  baseApp: BaseApp,
  wormhole: Wormhole,
  logger: Logger,
) {
  for (const [chainName, wormholeChain] of wormhole.app.chains) {
    if (wormholeChain.altTable === undefined) {
      const createTable = await alt.createTable(wormholeChain.accounts);
      wormholeChain.altTable = new web3.PublicKey(
        createTable.lookupTableAddress.toBase58(),
      );
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        createTable.tx,
        `wormhole (${chainName}) alt creation`,
        logger,
        baseApp.keypair,
      );
    } else {
      logger.info(`ALT Table Defined -- ${wormholeChain.altTable!}`);
      const lookupTableAccount = (
        await baseApp.anchorProvider.connection.getAddressLookupTable(
          new web3.PublicKey(wormholeChain.altTable!),
        )
      ).value;
      for (let i = 1; i <= lookupTableAccount.state.addresses.length; i += 1) {
        logger.info(
          `ALT Account ${i}/${lookupTableAccount.state.addresses.length} -- ${lookupTableAccount.state.addresses[i - 1]}`,
        );
      }
    }
  }
}
