import { Command } from 'commander';
import { simulateAndBroadcast } from '@lib/helpers';
import { MultisigProvider } from '@lib/multisig_provider';
import { bignumber } from 'mathjs';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';
import { WormholeEthereum } from '@lib/wormhole';

export function registerWormholeEthereumCommand(
  program: Command,
  logger: Logger,
  baseApp: BaseApp,
  wormholeEthereum: WormholeEthereum,
  multisigProvider: MultisigProvider,
) {
  program
    .command('wormhole-ethereum')
    .description(
      'Creates a proposal with Wormhole execution message transferWrappedWithPayload',
    )
    .requiredOption(
      '--recepient <recepient>',
      'Hex address, starts with 0x (e.g. --recepiet 0xABCDEF...)',
    )
    .requiredOption(
      '--amount <amount>',
      'Amount of tokens we have to provide (e.g. --amount 123USDC)',
    )
    .option(
      '--fee-tolerance <fee_tolerance>',
      'Fee tolerance for transfering tokens, denomination is taken from <amount> option (e.g. --fee-tolerance 123)',
    )
    .action(async (options) => {});
}
