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

const logger = getLogger();

async function main() {
  const config = getConfig(process.env.CONFIG_PATH);
  logger.info('Read config');

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
    logger.info('Simulating table creation');
    logger.debug(await config.anchor_provider.simulate(tx, [config.keypair]));
    logger.info(
      `Table creation simulation success -- ${createTable.lookupTableAddress.toBase58()}`,
    );
    logger.info('Broadcasting transaction');
    const transactionHash = await config.anchor_provider.sendAndConfirm(
      tx,
      [config.keypair],
      {
        commitment: 'confirmed',
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      },
    );
    logger.info(`Broadcasting transaction success ${transactionHash}`);
    config.multisig_ata = createTable.lookupTableAddress.toBase58();
  }

  const multisigKey = new web3.PublicKey(config.multisig_address);
  const lookupTableAccount = (
    await config.anchor_provider.connection.getAddressLookupTable(
      new web3.PublicKey(config.multisig_ata),
    )
  ).value;
  const addLiquidityInstruction = await prepareRawInstruction(
    config.anchor_provider,
    config.provide_liquidity.coins.get('USDC'),
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

  const tx = new web3.Transaction({
    recentBlockhash: (
      await config.anchor_provider.connection.getLatestBlockhash()
    ).blockhash,
  }).add(
    createBatchInstruction,
    createProposalInstruction,
    addInstructionInstruction,
    proposalActivateInstruction,
    proposalApproveInstruction,
  );

  logger.info('Simulating providing liquidity propopsal');
  logger.debug(await config.anchor_provider.simulate(tx, [config.keypair]));
  logger.info('Providing liquidity propopsal simulation success');
  logger.info('Broadcasting transaction');
  const transactionHash = await config.anchor_provider.sendAndConfirm(tx, [
    config.keypair,
  ]);
  logger.info(`Broadcasting transaction success ${transactionHash}`);
}

main();
