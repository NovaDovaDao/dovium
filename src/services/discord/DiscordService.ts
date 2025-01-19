import axios from 'axios';
import { DiscordConfig } from '../../core/types/Config';
import { BirdEyeToken } from '../../core/types/BirdEyeToken';
import { TopTrader } from '../../core/types/TopTraders';
import { TrendingToken } from '../../core/types/TrendingTokens';
import { TokenHolder } from '../../core/types/TokenHolders';

export class DiscordService {
  private config: DiscordConfig;

  constructor(config: DiscordConfig) {
    this.config = config;
  }

  private async sendWebhook(embeds: any[]) {
    if (!this.config.enabled) return;

    try {
      await axios.post(this.config.webhookUrl, {
        embeds: embeds
      });
    } catch (error) {
      console.error('Error sending Discord webhook:', error);
    }
  }

  async sendTokenList(tokens: BirdEyeToken[]) {
    const embeds = tokens.slice(0, 10).map(token => ({
      title: `${token.name} (${token.symbol})`,
      color: token.v24hChangePercent && token.v24hChangePercent > 0 ? 0x00ff00 : 0xff0000,
      fields: [
        {
          name: 'Address',
          value: `\`${token.address}\``,
          inline: true
        },
        {
          name: 'Liquidity',
          value: `$${token.liquidity.toLocaleString()}`,
          inline: true
        },
        {
          name: '24h Change',
          value: `${token.v24hChangePercent?.toFixed(2) || 'N/A'}%`,
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    }));

    await this.sendWebhook(embeds);
  }

  async sendTopTraders(traders: TopTrader[]) {
    const embeds = traders.slice(0, 10).map(trader => ({
      title: `Top Trader Activity`,
      color: 0x0099ff,
      fields: [
        {
          name: 'Address',
          value: `\`${trader.address}\``,
          inline: true
        },
        {
          name: 'Volume (USD)',
          value: `$${trader.volumeUSD.toLocaleString()}`,
          inline: true
        },
        {
          name: 'Number of Trades',
          value: trader.trades.toString(),
          inline: true
        },
        {
          name: 'Average Price',
          value: `$${trader.priceAvg.toFixed(2)}`,
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    }));

    await this.sendWebhook(embeds);
  }

  async sendTrendingTokens(tokens: TrendingToken[]) {
    const embeds = tokens.slice(0, 10).map((token, index) => ({
      title: `#${index + 1} - ${token.name} (${token.symbol})`,
      color: 0x00bfff,
      fields: [
        {
          name: 'Address',
          value: `\`${token.address}\``,
          inline: true
        },
        {
          name: 'Rank',
          value: token.rank?.toString() || 'N/A',
          inline: true
        },
        {
          name: '24h Volume',
          value: token.volume24hUSD ? `$${token.volume24hUSD.toLocaleString()}` : 'N/A',
          inline: true
        },
        {
          name: 'Liquidity',
          value: token.liquidity ? `$${token.liquidity.toLocaleString()}` : 'N/A',
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    }));

    await this.sendWebhook(embeds);
  }

  async sendTokenHolders(holders: TokenHolder[], tokenAddress: string) {
    const summaryEmbed = {
      title: `Token Holders Summary`,
      description: `Top holders for token: \`${tokenAddress}\``,
      color: 0x9932cc,
      fields: [
        {
          name: 'Total Holders in Response',
          value: holders.length.toString(),
          inline: true
        },
        {
          name: 'Top Holder Percentage',
          value: `${holders[0]?.percentage.toFixed(2)}%` || 'N/A',
          inline: true
        },
        {
          name: 'Top 10 Total Percentage',
          value: `${holders.slice(0, 10).reduce((sum, holder) => sum + holder.percentage, 0).toFixed(2)}%`,
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    };

    const holderEmbeds = holders.slice(0, 10).map((holder, index) => ({
      title: `#${holder.rank} - Token Holder`,
      color: 0x9932cc,
      fields: [
        {
          name: 'Wallet Address',
          value: `\`${holder.owner}\``,
          inline: false
        },
        {
          name: 'Amount Held',
          value: holder.amount.toLocaleString(),
          inline: true
        },
        {
          name: 'Percentage',
          value: `${holder.percentage.toFixed(2)}%`,
          inline: true
        }
      ]
    }));

    await this.sendWebhook([summaryEmbed, ...holderEmbeds]);
  }
}
