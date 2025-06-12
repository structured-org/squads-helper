import { type Alt } from '.';
import { type WormholeApp } from '@config/config';

export async function createWormholeAltTablesIfNotExist(
  alt: Alt,
  wormholeApp: WormholeApp,
) {
  for (const [chainName, wormholeChain] of wormholeApp.chains) {
    const ty = `Wormhole (${chainName})`;
    await alt.createAndFillAltIfNecessary(wormholeChain, ty);
  }
}
