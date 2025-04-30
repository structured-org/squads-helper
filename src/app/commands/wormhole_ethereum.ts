import { Command } from 'commander';
import { simulateAndBroadcast } from '@lib/helpers';
import { MultisigProvider } from '@lib/multisig_provider';
import { BaseApp } from '@config/config';
import { Logger } from 'pino';
import { WormholeEthereum } from '@lib/wormhole';
import { bignumber } from 'mathjs';

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
    .action(async (options) => {
      logger.debug('Reading the config');
      const [, amount, denom] = options.amount.match(
        /^(\d+(?:\.\d+)?)([A-Z]+)$/,
      );

      const wormholeToken = wormholeEthereum.app.coins.get(denom);
      if (wormholeToken === undefined) {
        logger.error(
          `--amount: No such a coin described in the config -- ${denom}`,
        );
        process.exit(-1);
      }

      const relayerFee = await wormholeEthereum.getRelayerFee(wormholeToken);
      if (
        options.feeTolerance !== undefined &&
        relayerFee >= options.feeTolerance
      ) {
        logger.error(
          `--fee-tolerance: Relayer Fee >= feeTolerance -- ${relayerFee}`,
        );
        process.exit(-1);
      }
      if (relayerFee >= BigInt(amount)) {
        logger.error(`--amount: Relayer Fee >= amount -- ${relayerFee}`);
        process.exit(-1);
      }
      if (options.feeTolerance !== undefined) {
        logger.info(
          `Wormhole Relayer Fee Tolerance -- ${options.feeTolerance}${denom}`,
        );
      }

      const tx = await multisigProvider.wormholeTransferEthereum(
        {
          denom: denom,
          amount: bignumber(amount),
          precision: wormholeToken.decimals,
        },
        options.recepient,
      );
      await simulateAndBroadcast(
        baseApp.anchorProvider,
        tx,
        'Wormhole Transfer',
        logger,
        baseApp.keypair,
      );
    });
}
