import { Command } from 'commander';
import { registerAddLiquidityCommand } from './commands/add_liquidity';
import { registerRemoveLiquidityCommand } from './commands/remove_liquidity';
import { registerAbsoluteAddLiquidityCommand } from './commands/absolte_add_liquidity';

const program = new Command();

program
  .name('squads-jlp-helper')
  .description('CLI to operate a SQUADS multisig with different messages')
  .version('1.1.0');

registerAddLiquidityCommand(program);
registerRemoveLiquidityCommand(program);
registerAbsoluteAddLiquidityCommand(program);

program.parse();
