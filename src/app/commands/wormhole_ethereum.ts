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
      '--recipient <recipient>',
      'Hex address, starts with 0x (e.g. --recipient 0xABCDEF...)',
    )
    .requiredOption(
      '--amount <amount>',
      'Amount of tokens we have to provide (e.g. --amount 123USDC)',
    )
    .option(
      '--fee-tolerance <fee_tolerance>',
      'Fee tolerance for transferring tokens, denomination is taken from <amount> option (e.g. --fee-tolerance 123)',
    )
    .action(async (options) => {
      logger.debug('Reading the config');
      const regexResult = options.amount.match(/^(\d+)([A-Z]+)$/);
      if (regexResult === null) {
        logger.error(
          `--amount: Specify the integer format <amount><denom> (e.g. 123USDC). Precision will be taken from the config later during execution. Your input: ${options.amount}`,
        );
        process.exit(-1);
      }
      const [, amount, assetDenom] = regexResult;

      const wormholeToken = wormholeEthereum.app.coins.get(assetDenom);
      if (wormholeToken === undefined) {
        logger.error(
          `--amount: No such a coin described in the config -- ${assetDenom}`,
        );
        process.exit(-1);
      }

      const relayerFee = await wormholeEthereum.getRelayerFee(wormholeToken);
      if (
        options.feeTolerance !== undefined &&
        relayerFee >= BigInt(options.feeTolerance)
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
          `Wormhole Relayer Fee Tolerance -- ${options.feeTolerance}${assetDenom}`,
        );
      }

      const tx = await multisigProvider.wormholeTransferEthereum(
        {
          denom: assetDenom,
          amount: bignumber(amount),
          precision: wormholeToken.decimals,
        },
        options.recipient,
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
