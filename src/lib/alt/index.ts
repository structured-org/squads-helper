import { web3 } from '@project-serum/anchor';
import { Logger } from 'pino';
import { type BaseApp } from '@config/config';
import { simulateAndBroadcast } from '@lib/helpers';

type HasAlt = { altAccounts: Array<web3.PublicKey>; altTable?: web3.PublicKey };

export class Alt {
  private logger: Logger;
  private baseApp: BaseApp;

  constructor(logger: Logger, baseApp: BaseApp) {
    this.logger = logger;
    this.baseApp = baseApp;
  }

  private async useAltRawInstruction(): Promise<
    [web3.TransactionInstruction, web3.PublicKey]
  > {
    return web3.AddressLookupTableProgram.createLookupTable({
      authority: this.baseApp.keypair.publicKey,
      payer: this.baseApp.keypair.publicKey,
      recentSlot: await this.baseApp.anchorProvider.connection.getSlot(),
    });
  }

  private registerAltRawInstruction(
    altAddress: web3.PublicKey,
    accounts: Array<web3.PublicKey>,
  ): web3.TransactionInstruction {
    return web3.AddressLookupTableProgram.extendLookupTable({
      payer: this.baseApp.keypair.publicKey,
      authority: this.baseApp.keypair.publicKey,
      lookupTable: altAddress,
      addresses: accounts,
    });
  }

  async createTable(altAccounts: Array<web3.PublicKey>): Promise<{
    tx: web3.Transaction;
    lookupTableAddress: web3.PublicKey;
  }> {
    const [lookupTableIx, lookupTableAddress] =
      await this.useAltRawInstruction();

    this.logger.info(`ALT address -- ${lookupTableAddress}`);
    for (let i = 1; i <= altAccounts.length; i += 1) {
      this.logger.info(
        `ALT account ${i}/${altAccounts.length} -- ${altAccounts[i - 1]}`,
      );
    }

    const registerNewAddressesIx = this.registerAltRawInstruction(
      lookupTableAddress,
      altAccounts,
    );
    return {
      tx: new web3.Transaction().add(lookupTableIx, registerNewAddressesIx),
      lookupTableAddress: lookupTableAddress,
    };
  }

  private async createAndFillAlt<T extends HasAlt>(instance: T, ty: string) {
    const createTable = await this.createTable(instance.altAccounts);
    instance.altTable = new web3.PublicKey(
      createTable.lookupTableAddress.toBase58(),
    );
    await simulateAndBroadcast(
      this.baseApp.anchorProvider,
      createTable.tx,
      `${ty} ALT Creation`,
      this.logger,
      this.baseApp.keypair,
    );
  }

  async createAndFillAltIfNecessary<T extends HasAlt>(instance: T, ty: string) {
    if (instance.altTable === undefined) {
      await this.createAndFillAlt(instance, ty);
    } else {
      const lookupTableAccount = (
        await this.baseApp.anchorProvider.connection.getAddressLookupTable(
          new web3.PublicKey(instance.altTable!),
        )
      ).value;
      let expectedAccounts = [...instance.altAccounts];
      this.logger.info(`${ty} ALT Table Defined -- ${instance.altTable!}`);

      for (let i = 1; i <= lookupTableAccount.state.addresses.length; i += 1) {
        const lookupAddress = lookupTableAccount.state.addresses[i - 1];
        this.logger.info(
          `ALT Account ${i}/${lookupTableAccount.state.addresses.length} -- ${lookupAddress}`,
        );
        expectedAccounts = expectedAccounts.filter(
          (account) => account.toBase58() !== lookupAddress.toBase58(),
        );
      }
      if (expectedAccounts.length !== 0) {
        for (const remainingAccount of expectedAccounts) {
          this.logger.warn(`${ty} ALT missing -- ${remainingAccount}`);
        }
        this.logger.info(`${ty} Creating a new ALT`);
        await this.createAndFillAlt(instance, ty);
        this.logger.info(`${ty} Using new ALT -- ${instance.altTable!}`);
      }
    }
  }
}

export { createJupiterPerpsAltTableIfNotExist } from './jupiter_perps';
export { createWormholeAltTablesIfNotExist } from './wormhole';
