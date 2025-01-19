// src/app.ts
import dotenv from 'dotenv';
import { BirdEyeClient } from './services/birdeye/BirdEyeClient';
import { DiscordService } from './services/discord/DiscordService';
import { parseArguments } from './utils/cli';

dotenv.config();

async function main() {
  try {
    // Verify environment variables
    if (!process.env.DISCORD_WEBHOOK_URL) {
      console.warn('Warning: DISCORD_WEBHOOK_URL is not set in .env');
    }
    
    if (process.env.DISCORD_ENABLED !== 'true') {
      console.warn('Warning: Discord integration is disabled. Set DISCORD_ENABLED=true in .env to enable.');
    }

    const args = parseArguments();
    const client = new BirdEyeClient();
    
    console.log('Initializing Discord service with config:');
    console.log('- Webhook enabled:', process.env.DISCORD_ENABLED === 'true');
    console.log('- Webhook URL configured:', !!process.env.DISCORD_WEBHOOK_URL);
    
    const discordService = new DiscordService({
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
      enabled: process.env.DISCORD_ENABLED === 'true'
    });

    switch (args.endpoint) {
      case 'tokenlist': {
        console.log('Fetching token list...');
        const tokens = await client.getTokenList({
          sortBy: args.sortBy || 'v24hUSD',
          sortType: 'desc',
          offset: 0,
          limit: args.limit || 50,
          minLiquidity: 50000
        });
        console.log(`Fetched ${tokens.length} tokens, sending to Discord...`);
        await discordService.sendTokenList(tokens);
        break;
      }
      
      case 'toptraders': {
        console.log('Fetching top traders...');
        const traders = await client.getTopTraders({
          timeFrame: args.timeFrame as any,
          limit: args.limit,
          sortBy: args.sortBy as any
        });
        console.log(`Fetched ${traders.length} traders, sending to Discord...`);
        await discordService.sendTopTraders(traders);
        break;
      }

      default:
        console.error('Invalid endpoint specified');
        process.exit(1);
    }

    console.log('Operation completed successfully');
  } catch (error) {
    console.error('Error in main:', error);
    process.exit(1);
  }
}

main();