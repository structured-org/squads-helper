import { BigNumber } from 'mathjs';

export type Coin = {
  amount: BigNumber;
  denom: string;
  precision: number;
};
