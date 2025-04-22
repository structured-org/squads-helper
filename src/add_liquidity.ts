import { getConfig } from '@config/config';
import { Squads } from '@actions/squads/squads';
import {
  useAltRawInstruction,
  registerAltRawInstruction,
  UseAltRawInstruction,
} from '@actions/alt';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { confirmTransaction } from '@solana-developers/helpers';
import { bignumber } from 'mathjs';
import { Jupiter } from '@actions/jlp';

const logger = getLogger();
const config = getConfig(process.env.CONFIG_PATH);
const jlp = new Jupiter(logger, config);
const squads = new Squads(logger, config);

async function main() {
  if (process.env.TOKEN_AMOUNT === undefined) {
    logger.error(
      "It's required to declare TOKEN_AMOUNT -- (TOKEN_AMOUNT=123USDC SLIPPAGE_TOLERANCE=0.01 npm run add-liquidity)",
    );
    process.exit(-1);
  }
  if (process.env.SLIPPAGE_TOLERANCE === undefined) {
    logger.error(
      "It's required to declare SLIPPAGE_TOLERANCE -- (TOKEN_AMOUNT=123USDC SLIPPAGE_TOLERANCE=0.01 npm run add-liquidity)",
    );
    process.exit(-1);
  }
  logger.info('Reading the config');
  const config = getConfig(process.env.CONFIG_PATH);
  const [, amount, denom] = process.env.TOKEN_AMOUNT.match(
    /^(\d+(?:\.\d+)?)([A-Z]+)$/,
  );
  if (config.jupiter_perps.coins.get(denom) === undefined) {
    logger.error(`No such a coin described in the config -- ${denom}`);
    process.exit(-1);
  }

  // We need to have ALT for further addLiquidity2 instruction contraction
  if (config.jupiter_perps.alt_table === undefined) {
    const createTable: UseAltRawInstruction = await useAltRawInstruction(
      config.anchor_provider,
      config.keypair.publicKey,
    );
    const registerAccounts = registerAltRawInstruction(
      config.keypair.publicKey,
      createTable.lookupTableAddress,
      config.jupiter_perps.accounts.map(
        (account) => new web3.PublicKey(account),
      ),
    );
    const tx = new web3.Transaction().add(
      createTable.lookupTableInstruction,
      registerAccounts,
    );
    logger.info('Simulating table creation');
    logger.debug(await config.anchor_provider.simulate(tx, [config.keypair]));
    logger.info(
      `Table creation simulation success -- ${createTable.lookupTableAddress.toBase58()}`,
    );
    logger.info('Broadcasting transaction');
    const transactionHash =
      await config.anchor_provider.connection.sendTransaction(
        tx,
        [config.keypair],
        {
          skipPreflight: true,
          preflightCommitment: 'confirmed',
        },
      );
    logger.info(`Broadcasting transaction success -- ${transactionHash}`);
    config.jupiter_perps.alt_table = new web3.PublicKey(
      createTable.lookupTableAddress.toBase58(),
    );
    await confirmTransaction(
      config.anchor_provider.connection,
      transactionHash,
      'finalized',
    );
  } else {
    logger.info(`ALT table defined -- ${config.jupiter_perps.alt_table!}`);
  }
  const lookupTableAccount = (
    await config.anchor_provider.connection.getAddressLookupTable(
      new web3.PublicKey(config.jupiter_perps.alt_table!),
    )
  ).value;
  const addLiquidityIx = await jlp.provideLiquidityIx(
    config.squads_multisig.vault_pda,
    {
      denom: denom,
      amount: bignumber(amount),
      precision: config.jupiter_perps.coins.get(denom)!.decimals,
    },
    Number(process.env.SLIPPAGE_TOLERANCE),
  );
  const createBatchIx = await squads.createBatchIx();
  const createProposalIx = await squads.createProposalIx();
  const addInstructionIx = await squads.batchAddIxV0(
    addLiquidityIx,
    lookupTableAccount,
  );
  const proposalActivateIx = await squads.proposalActivateIx();
  const proposalApproveIx = await squads.proposalApproveIx();
  const tx = new web3.Transaction().add(
    createBatchIx,
    createProposalIx,
    addInstructionIx,
    proposalActivateIx,
    proposalApproveIx,
  );
  logger.info(
    `Provide liquidity -- (TOKEN_AMOUNT=${process.env.TOKEN_AMOUNT}, SLIPPAGE_TOLERANCE=${process.env.SLIPPAGE_TOLERANCE})`,
  );
  logger.info('Simulating liquidity provision propopsal');
  logger.debug(await config.anchor_provider.simulate(tx, [config.keypair]));
  logger.info('Liquidity provision propopsal simulation success');
  logger.info('Broadcasting transaction');
  const transactionHash =
    await config.anchor_provider.connection.sendTransaction(
      tx,
      [config.keypair],
      {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      },
    );
  await confirmTransaction(
    config.anchor_provider.connection,
    transactionHash,
    'finalized',
  );
  logger.info(`Broadcasting transaction success -- ${transactionHash}`);
}

main();
