import { getConfig } from '@config/config';
import { prepareRawInstruction } from '@actions/provide_liquidity';
import {
  createProposalRawInstruction,
  createBatchRawInstruction,
  batchAddRawInstructionV0,
  proposalActivateRawInstruction,
  proposalApproveRawInstruction,
} from '@actions/create_proposal';
import { web3 } from '@project-serum/anchor';

async function main() {
  const config = getConfig(process.env.CONFIG_PATH);
  const multisigKey = new web3.PublicKey(config.multisig_address);

  const lookupTableAddress = new web3.PublicKey(
    '8ytqcjgNJB87rWdJ1RQw1MSA5ZKgnrpLCvM1zbPC5jS8',
  );
  const lookupTableAccount = (
    await config.anchor_provider.connection.getAddressLookupTable(
      lookupTableAddress,
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
  const createProposalInstruction = await createProposalRawInstruction(
    multisigKey,
    config.anchor_provider,
    config.keypair.publicKey,
  );
  const createBatchInstruction = await createBatchRawInstruction(
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

  console.log(await config.anchor_provider.simulate(tx, [config.keypair]));
  console.log(
    await config.anchor_provider.sendAndConfirm(tx, [config.keypair]),
  );
}

main();
