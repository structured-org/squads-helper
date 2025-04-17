import { AnchorProvider } from '@project-serum/anchor';
import { web3, Program } from '@project-serum/anchor';
import { BigNumber, bignumber, round } from 'mathjs';

export type PoolAum = {
  WSOL: BigNumber;
  WETH: BigNumber;
  WBTC: BigNumber;
  USDC: BigNumber;
  USDT: BigNumber;
  AUM: BigNumber;
};

export async function getPoolAum(
  provider: AnchorProvider,
  jlpPoolAddress: string,
  programIdlPath: string,
  perpetualsAddress: string,
  poolAddress: string,
  accounts: string[],
): Promise<PoolAum> {
  const program = new web3.PublicKey(jlpPoolAddress);
  const programIdl = JSON.parse(
    require('fs').readFileSync(programIdlPath, {
      encoding: 'utf-8',
    }),
  );
  const programInstance = new Program(programIdl, program, provider);
  const txConfig = { mode: { max: {} } };
  const rawTx = programInstance.methods
    .getAssetsUnderManagement2(txConfig)
    .accounts({
      perpetuals: perpetualsAddress,
      pool: poolAddress,
    })
    .remainingAccounts(
      accounts.map((account) => ({
        pubkey: new web3.PublicKey(account),
        isWritable: false,
        isSigner: false,
      })),
    );
  const simulationResult = await rawTx.simulate();
  const priceList = simulationResult.raw
    .filter((str) => str.startsWith('Program log: doves ag price:'))
    .map((str) => str.split(' ')[5].replace(',', ''));
  const txAum = simulationResult.raw
    .filter((str) => str.startsWith('Program return'))[0]
    .split(' ');
  const aumStr = txAum[txAum.length - 1];
  const reversedBuffer = Buffer.from(aumStr, 'base64').reverse();
  const parsedInteger = BigInt('0x' + reversedBuffer.toString('hex'));
  return {
    WSOL: bignumber(priceList[0]).div(Math.pow(10, 8)),
    WETH: bignumber(priceList[1]).div(Math.pow(10, 8)),
    WBTC: bignumber(priceList[2]).div(Math.pow(10, 8)),
    USDC: bignumber(priceList[3]).div(Math.pow(10, 8)),
    USDT: bignumber(priceList[4]).div(Math.pow(10, 8)),
    AUM: bignumber(parsedInteger).div(Math.pow(10, 6)),
  };
}

export async function getVirtualPrice(
  provider: AnchorProvider,
  jlpTokenAddress: string,
  jlpPoolAddress: string,
  programIdlPath: string,
  perpetualsAddress: string,
  poolAddress: string,
  accounts: string[],
): Promise<BigNumber> {
  const totalSupply = bignumber(
    (
      await provider.connection.getTokenSupply(
        new web3.PublicKey(jlpTokenAddress),
      )
    ).value.amount,
  ).div(Math.pow(10, 6));
  const poolAum = (
    await getPoolAum(
      provider,
      jlpPoolAddress,
      programIdlPath,
      perpetualsAddress,
      poolAddress,
      accounts,
    )
  ).AUM.div(Math.pow(10, 6));
  return round(poolAum.div(totalSupply), 6);
}

export async function getLpTokenAmount(
  token: string,
  amount: BigNumber,
  slippageTolerance: number,

  provider: AnchorProvider,
  jlpTokenAddress: string,
  jlpPoolAddress: string,
  programIdlPath: string,
  perpetualsAddress: string,
  poolAddress: string,
  accounts: string[],
): Promise<BigNumber> {
  const totalSupply = bignumber(
    (
      await provider.connection.getTokenSupply(
        new web3.PublicKey(jlpTokenAddress),
      )
    ).value.amount,
  );
  const poolData = await getPoolAum(
    provider,
    jlpPoolAddress,
    programIdlPath,
    perpetualsAddress,
    poolAddress,
    accounts,
  );
  console.log(poolData);
  const poolAum = poolData.AUM;
  const virtualPrice = poolAum.mul(Math.pow(10, 6)).div(totalSupply);
  const tokenPrice = poolData[token]!.mul(amount);
  const minLpAmount = tokenPrice.div(virtualPrice).mul(1.0 - slippageTolerance);
  return minLpAmount.round();
}
