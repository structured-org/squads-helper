import { web3 } from '@project-serum/anchor';
import { Logger } from 'pino';
import { Config } from '@config/config';

export class Alt {
  private logger: Logger;
  private config: Config;

  constructor(logger: Logger, config: Config) {
    this.logger = logger;
    this.config = config;
  }

  private async useAltRawInstruction(): Promise<
    [web3.TransactionInstruction, web3.PublicKey]
  > {
    return web3.AddressLookupTableProgram.createLookupTable({
      authority: this.config.keypair.publicKey,
      payer: this.config.keypair.publicKey,
      recentSlot: await this.config.anchor_provider.connection.getSlot(),
    });
  }

  private registerAltRawInstruction(
    altAddress: web3.PublicKey,
  ): web3.TransactionInstruction {
    return web3.AddressLookupTableProgram.extendLookupTable({
      payer: this.config.keypair.publicKey,
      authority: this.config.keypair.publicKey,
      lookupTable: altAddress,
      addresses: this.config.jupiter_perps.accounts,
    });
  }

  async createTable(): Promise<{
    tx: web3.Transaction;
    lookupTableAddress: web3.PublicKey;
  }> {
    const [lookupTableIx, lookupTableAddress] =
      await this.useAltRawInstruction();
    const registerNewAddressesIx =
      this.registerAltRawInstruction(lookupTableAddress);
    return {
      tx: new web3.Transaction().add(lookupTableIx, registerNewAddressesIx),
      lookupTableAddress: lookupTableAddress,
    };
  }
}
