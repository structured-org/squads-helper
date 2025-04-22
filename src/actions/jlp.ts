import { Logger } from 'pino';
import { type Config } from '@config/config';
import { BigNumber, bignumber, round } from 'mathjs';
import { Coin } from '@lib/coin';
import { web3, Program, BN } from '@project-serum/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { AccountMeta } from '@solana/web3.js';

export type PoolAum = {
  WSOL: BigNumber;
  WETH: BigNumber;
  WBTC: BigNumber;
  USDC: BigNumber;
  USDT: BigNumber;
  AUM: BigNumber;
};

const JLP_PRECISION: number = 6;

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
        new web3.PublicKey(
          this.config.jupiter_perps.lp_token_mint.token_address,
        ),
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
      `(${round(totalTokenPrice, coin.precision)} * (1.0 - ${slippageTolerance})) / (${round(virtualPrice, 3)}) = ${round(minLpAmount, JLP_PRECISION)}`,
    );
    return minLpAmount;
  }

  async getTokenAmountOut(
    lpIn: Coin,
    denomOut: string,
    slippageTolerance: number,
  ): Promise<BigNumber> {
    const totalSupply = await this.getLpTokenTotalSupply();
    const poolData = await this.getPoolAum();
    const poolAum = poolData.AUM;

    const virtualPrice = poolAum.mul(Math.pow(10, 6)).div(totalSupply);
    const lpInTotalPrice = virtualPrice.mul(lpIn.amount).div(Math.pow(10, 6));
    const tokenPrice = poolData[denomOut]!;
    const tokenAmountOut = lpInTotalPrice
      .div(tokenPrice)
      .mul(1.0 - slippageTolerance);
    return bignumber(tokenAmountOut);
  }

  async removeLiquidityIx(
    provider: web3.PublicKey,
    lpIn: Coin,
    denomOut: string,
    slippageTolerance: number,
  ): Promise<web3.TransactionInstruction> {
    const outputCoin = this.config.jupiter_perps.coins.get(denomOut)!;
    const program = this.config.jupiter_perps.program;
    const programInstance = new Program(
      this.config.jupiter_perps.program_idl,
      program,
      this.config.anchor_provider,
    );
    const lpTokenAccount = new web3.PublicKey(
      getAssociatedTokenAddressSync(
        this.config.jupiter_perps.lp_token_mint.token_address,
        provider,
        true,
      ).toBase58(),
    );
    const receivingAccount = new web3.PublicKey(
      getAssociatedTokenAddressSync(
        outputCoin.token_address,
        provider,
        true,
      ).toBase58(),
    );
    const remainingAccounts: AccountMeta[] =
      this.config.jupiter_perps.accounts.map((account) => ({
        pubkey: new web3.PublicKey(account),
        isWritable: false,
        isSigner: false,
      }));
    const amountTokenOut = await this.getTokenAmountOut(
      lpIn,
      denomOut,
      slippageTolerance,
    );
    const minAmountTokenOut = amountTokenOut
      .mul(Math.pow(10, outputCoin.decimals))
      .round();
    this.logger.info(`lpAmountIn -- ${lpIn.amount.toString()}`);
    this.logger.info(`minAmountOut -- ${minAmountTokenOut.toString()}`);
    const params = {
      lpAmountIn: new BN(lpIn.amount.toString()),
      minAmountOut: new BN(minAmountTokenOut.toString()),
    };
    const transaction = programInstance.methods
      .removeLiquidity2(params)
      .accounts({
        owner: provider,
        receivingAccount: receivingAccount,
        lpTokenAccount: lpTokenAccount,
        transferAuthority: outputCoin.input_accounts.transfer_authority,
        perpetuals: outputCoin.input_accounts.perpetuals,
        pool: outputCoin.input_accounts.pool,
        custody: outputCoin.input_accounts.custody,
        custodyDovesPriceAccount:
          outputCoin.input_accounts.custody_doves_price_account,
        custodyPythnetPriceAccount:
          outputCoin.input_accounts.custody_pythnet_price_account,
        custodyTokenAccount: outputCoin.input_accounts.custody_token_account,
        lpTokenMint: outputCoin.input_accounts.lp_token_mint,
        tokenProgram: outputCoin.input_accounts.token_program,
        eventAuthority: outputCoin.input_accounts.event_authority,
        program: outputCoin.input_accounts.program,
      })
      .remainingAccounts(remainingAccounts);
    return await transaction.instruction();
  }

  async provideLiquidityIx(
    provider: web3.PublicKey,
    coin: Coin,
    slippageTolerance: number,
  ): Promise<web3.TransactionInstruction> {
    const inputCoin = this.config.jupiter_perps.coins.get(coin.denom)!;
    const program = this.config.jupiter_perps.program;
    const programInstance = new Program(
      this.config.jupiter_perps.program_idl,
      program,
      this.config.anchor_provider,
    );
    const fundingAccount = new web3.PublicKey(
      getAssociatedTokenAddressSync(
        new web3.PublicKey(inputCoin.token_address),
        provider,
        true,
      ).toBase58(),
    );
    const lpTokenAccount = new web3.PublicKey(
      getAssociatedTokenAddressSync(
        this.config.jupiter_perps.lp_token_mint.token_address,
        provider,
        true,
      ).toBase58(),
    );
    const remainingAccounts: AccountMeta[] =
      this.config.jupiter_perps.accounts.map((account) => ({
        pubkey: new web3.PublicKey(account),
        isWritable: false,
        isSigner: false,
      }));
    const minLpTokenAmountValue = await this.getLpTokenAmount(
      coin,
      slippageTolerance,
    );
    const minLpTokenAmount = minLpTokenAmountValue
      .mul(Math.pow(10, JLP_PRECISION))
      .round();
    this.logger.info(`tokenAmountIn -- ${coin.amount.toString()}`);
    this.logger.info(`minLpTokenAmount -- ${minLpTokenAmount.toString()}`);
    const params = {
      tokenAmountIn: new BN(coin.amount.toString()),
      minLpAmountOut: new BN(minLpTokenAmount.toString()),
      tokenAmountPreSwap: null,
    };
    const transaction = programInstance.methods
      .addLiquidity2(params)
      .accounts({
        owner: provider,
        fundingAccount,
        lpTokenAccount,
        transferAuthority: inputCoin.input_accounts.transfer_authority,
        perpetuals: inputCoin.input_accounts.perpetuals,
        pool: inputCoin.input_accounts.pool,
        custody: inputCoin.input_accounts.custody,
        custodyDovesPriceAccount:
          inputCoin.input_accounts.custody_doves_price_account,
        custodyPythnetPriceAccount:
          inputCoin.input_accounts.custody_pythnet_price_account,
        custodyTokenAccount: inputCoin.input_accounts.custody_token_account,
        lpTokenMint: inputCoin.input_accounts.lp_token_mint,
        tokenProgram: inputCoin.input_accounts.token_program,
        eventAuthority: inputCoin.input_accounts.event_authority,
        program: inputCoin.input_accounts.program,
      })
      .remainingAccounts(remainingAccounts);
    return await transaction.instruction();
  }
}
