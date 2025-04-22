import { AnchorProvider, web3 } from '@project-serum/anchor';

export type UseAltRawInstruction = {
  lookupTableInstruction: web3.TransactionInstruction;
  lookupTableAddress: web3.PublicKey;
};

export async function useAltRawInstruction(
  provider: AnchorProvider,
  authority: web3.PublicKey,
): Promise<UseAltRawInstruction> {
  const [lookupTableInstruction, lookupTableAddress] =
    web3.AddressLookupTableProgram.createLookupTable({
      authority: authority,
      payer: authority,
      recentSlot: await provider.connection.getSlot(),
    });
  return {
    lookupTableInstruction,
    lookupTableAddress,
  };
}

export function registerAltRawInstruction(
  authority: web3.PublicKey,
  altAddress: web3.PublicKey,
  addresses: Array<web3.PublicKey>,
): web3.TransactionInstruction {
  return web3.AddressLookupTableProgram.extendLookupTable({
    payer: authority,
    authority: authority,
    lookupTable: altAddress,
    addresses: addresses,
  });
}
