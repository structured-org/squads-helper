import { web3 } from '@project-serum/anchor';
import { Logger } from 'pino';
import { type BaseApp } from '@config/config';

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

  async createTable(accounts: Array<web3.PublicKey>): Promise<{
    tx: web3.Transaction;
    lookupTableAddress: web3.PublicKey;
  }> {
    const [lookupTableIx, lookupTableAddress] =
      await this.useAltRawInstruction();
    const registerNewAddressesIx = this.registerAltRawInstruction(
      lookupTableAddress,
      accounts,
    );
    return {
      tx: new web3.Transaction().add(lookupTableIx, registerNewAddressesIx),
      lookupTableAddress: lookupTableAddress,
    };
  }
}
