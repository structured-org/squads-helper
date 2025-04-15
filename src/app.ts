import { getConfig } from '@config/config';
import { prepareRawInstruction } from '@actions/provide_liquidity';
import {
  createProposalRawInstruction,
  createBatchRawInstruction,
  batchAddRawInstructionV0,
  proposalActivateRawInstruction,
  proposalApproveRawInstruction,
} from '@actions/create_proposal/create_proposal';
import {
  useAltRawInstruction,
  registerAltRawInstruction,
  UseAltRawInstruction,
} from '@actions/alt';
import { web3 } from '@project-serum/anchor';
import { getLogger } from '@lib/logger';
import { confirmTransaction } from '@solana-developers/helpers';

const logger = getLogger();

async function main() {
  if (process.env.TOKEN_AMOUNT === undefined) {
    logger.error(
      "It's required to declare TOKEN_AMOUNT -- (TOKEN_AMOUNT=123USDC SLIPPAGE_TOLERANCE=0.01 npm run start)",
    );
    process.exit(-1);
  }
  if (process.env.SLIPPAGE_TOLERANCE === undefined) {
    logger.error(
      "It's required to declare SLIPPAGE_TOLERANCE -- (TOKEN_AMOUNT=123USDC SLIPPAGE_TOLERANCE=0.01 npm run start)",
    );
    process.exit(-1);
  }
  logger.info('Reading the config');
  const config = getConfig(process.env.CONFIG_PATH);
  const [, amount, denom] = process.env.TOKEN_AMOUNT.match(
    /^(\d+(?:\.\d+)?)([A-Z]+)$/,
  );
  if (config.provide_liquidity.coins.get(denom) === undefined) {
    logger.error(`No such a coin described in the config -- ${denom}`);
    process.exit(-1);
  }
  // We need to have ALT for further addLiquidity2 instruction contraction
  if (config.provide_liquidity.alt_table === undefined) {
    const createTable: UseAltRawInstruction = await useAltRawInstruction(
      config.anchor_provider,
      config.keypair.publicKey,
    );
    const registerAccounts = registerAltRawInstruction(
      config.keypair.publicKey,
      createTable.lookupTableAddress,
      config.provide_liquidity.accounts.map(
        (account) => new web3.PublicKey(account),
      ),
    );
    const tx = new web3.Transaction().add(
      createTable.lookupTableInstruction,
      registerAccounts,
    );
    logger.info('Simulating the table creation');
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
    config.provide_liquidity.alt_table =
      createTable.lookupTableAddress.toBase58();
    await confirmTransaction(
      config.anchor_provider.connection,
      transactionHash,
      'finalized',
    );
  } else {
    logger.info(`ALT table defined -- ${config.provide_liquidity.alt_table!}`);
  }

  const multisigKey = new web3.PublicKey(config.multisig_address);
  const lookupTableAccount = (
    await config.anchor_provider.connection.getAddressLookupTable(
      new web3.PublicKey(config.provide_liquidity.alt_table!),
    )
  ).value;
  const addLiquidityInstruction = await prepareRawInstruction(
    config.anchor_provider,
    amount,
    config.provide_liquidity.coins.get(denom)!,
    config.provide_liquidity.program_idl,
    config.multisig_ata,
    config.provide_liquidity.jlp_address,
    config.provide_liquidity.accounts,
  );
  const createBatchInstruction = await createBatchRawInstruction(
    multisigKey,
    config.anchor_provider,
    config.keypair.publicKey,
  );
  const createProposalInstruction = await createProposalRawInstruction(
    multisigKey,
    config.anchor_provider,
    config.keypair.publicKey,
  );
  const addInstructionInstruction = await batchAddRawInstructionV0(
    multisigKey,
    config.anchor_provider,
    config.keypair.publicKey,
    addLiquidityInstruction,
    config.multisig_ata,
    lookupTableAccount,
  );
  const proposalActivateInstruction = await proposalActivateRawInstruction(
    multisigKey,
    config.anchor_provider,
    config.keypair.publicKey,
  );
  const proposalApproveInstruction = await proposalApproveRawInstruction(
    multisigKey,
    config.anchor_provider,
    config.keypair.publicKey,
  );
  const tx = new web3.Transaction({}).add(
    createBatchInstruction,
    createProposalInstruction,
    addInstructionInstruction,
    proposalActivateInstruction,
    proposalApproveInstruction,
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
