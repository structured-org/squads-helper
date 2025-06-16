import { type JupiterPerpsApp } from '@config/config';
import { type Alt } from '.';

export async function createJupiterPerpsAltTableIfNotExist(
  alt: Alt,
  jupiterPerpsApp: JupiterPerpsApp,
) {
  const ty = 'Jupiter Perps';
  await alt.createAndFillAltIfNecessary(jupiterPerpsApp, ty);
}
