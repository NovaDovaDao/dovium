export interface DiscordConfig {
  webhookUrl: string;
  enabled: boolean;
}

export interface CommandLineArgs {
  endpoint: 'tokenlist' | 'toptraders';
  timeFrame?: string;
  limit?: number;
  sortBy?: string;
}
