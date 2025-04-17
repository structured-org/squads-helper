import { Logger } from 'pino';
import { Program } from '@project-serum/anchor';
import { web3 } from '@project-serum/anchor';
import { type Config } from '@config/config';
import { BigNumber, bignumber, round } from 'mathjs';
import { Coin } from '@lib/coin';

export type PoolAum = {
  WSOL: BigNumber;
  WETH: BigNumber;
  WBTC: BigNumber;
  USDC: BigNumber;
  USDT: BigNumber;
  AUM: BigNumber;
};

export class Jupiter {
  private logger: Logger;
  private config: Config;

  constructor(logger: Logger, config: Config) {
    this.logger = logger;
    this.config = config;
  }

  async getPoolAum(): Promise<PoolAum> {
    const program = this.config.jupiter_perps.program;
    const programIdl = this.config.jupiter_perps.program_idl;
    const programInstance = new Program(
      programIdl,
      program,
      this.config.anchor_provider,
    );
    const txConfig = { mode: { max: {} } };
    const rawTx = programInstance.methods
      .getAssetsUnderManagement2(txConfig)
      .accounts({
        perpetuals: this.config.jupiter_perps.perpetuals,
        pool: this.config.jupiter_perps.pool,
      })
      .remainingAccounts(
        this.config.jupiter_perps.accounts.map((account) => ({
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
    const wsolPrice = bignumber(priceList[0]).div(Math.pow(10, 8));
    const wethPrice = bignumber(priceList[1]).div(Math.pow(10, 8));
    const wbtcPrice = bignumber(priceList[2]).div(Math.pow(10, 8));
    const usdcPrice = bignumber(priceList[3]).div(Math.pow(10, 8));
    const usdtPrice = bignumber(priceList[4]).div(Math.pow(10, 8));
    const aumTotal = bignumber(parsedInteger).div(Math.pow(10, 6));
    this.logger.info(`WSOL price $ -- ${wsolPrice}`);
    this.logger.info(`WETH price $ -- ${wethPrice}`);
    this.logger.info(`WBTC price $ -- ${wbtcPrice}`);
    this.logger.info(`USDC price $ -- ${usdcPrice}`);
    this.logger.info(`USDT price $ -- ${usdtPrice}`);
    this.logger.info(`AUM total $ -- ${aumTotal}`);
    return {
      WSOL: wsolPrice,
      WETH: wethPrice,
      WBTC: wbtcPrice,
      USDC: usdcPrice,
      USDT: usdtPrice,
      AUM: aumTotal,
    };
  }

  async getLpTokenTotalSupply(): Promise<BigNumber> {
    const jlpTotalSupply = (
      await this.config.anchor_provider.connection.getTokenSupply(
        new web3.PublicKey(this.config.jupiter_perps.lp_token_mint),
      )
    ).value.amount;
    this.logger.info(`JLP total supply -- ${jlpTotalSupply}`);
    return bignumber(jlpTotalSupply);
  }

  async getLpTokenAmount(
    coin: Coin,
    slippageTolerance: number,
  ): Promise<BigNumber> {
    const totalSupply = await this.getLpTokenTotalSupply();
    const poolData = await this.getPoolAum();
    const poolAum = poolData.AUM;

    // poolAum.mul(10^6) means that we convert it from $ back to the absolute value
    // We can do that because pool originally returns it multiplied by 10^6 (see getPoolAum)
    // totalSupply is an absolute value either. So we divide the absolute dollar equivalent to the absolute totalSupply
    // absolute means without precision (e.g. absolute for usdc is 954345, when $ equivalent is 0.954345)
    const virtualPrice = poolAum.mul(Math.pow(10, 6)).div(totalSupply);

    const tokenPrice = poolData[coin.denom]!;
    const totalTokenPrice = tokenPrice
      .mul(coin.amount)
      .div(Math.pow(10, coin.precision));
    const minLpAmount = totalTokenPrice
      .div(virtualPrice)
      .mul(1.0 - slippageTolerance);
    this.logger.info(
      `(${round(totalTokenPrice, 3)} * (1.0 - ${slippageTolerance})) / (${round(virtualPrice, 3)}) = ${round(minLpAmount, 3)}`,
    );
    return round(minLpAmount, 6);
  }
}
