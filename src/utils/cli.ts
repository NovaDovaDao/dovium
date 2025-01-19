import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { CommandLineArgs } from '../core/types/Config';

export function parseArguments(): CommandLineArgs {
  const argv = yargs(hideBin(process.argv))
    .option('endpoint', {
      alias: 'e',
      type: 'string',
      description: 'API endpoint to call (tokenlist or toptraders)',
      choices: ['tokenlist', 'toptraders'],
      required: true
    })
    .option('timeFrame', {
      alias: 't',
      type: 'string',
      description: 'Time frame for top traders',
      choices: ['30m', '1h', '2h', '4h', '6h', '8h', '12h', '24h']
    })
    .option('limit', {
      alias: 'l',
      type: 'number',
      description: 'Number of results to fetch'
    })
    .option('sortBy', {
      alias: 's',
      type: 'string',
      description: 'Field to sort by'
    })
    .help()
    .argv as CommandLineArgs;

  return argv;
}
