export const config = {
  pump_fun_strategy: {
    enabled: true,
    minimum_sol_balance: 0.1,
    rsi: {
      period: 14,
      oversold: 30,
      overbought: 70,
    },
    macd: {
      fast_period: 12,
      slow_period: 26,
      signal_period: 9,
      buy_threshold: 0.02,
      sell_threshold: -0.02,
    },
    moving_average: {
      short_period: 10,
      long_period: 21,
    },
    volume_profile: {
      buy_pressure_threshold: 0.6,
      sell_pressure_threshold: 0.4,
    },
    market_depth: {
      min_bid_ask_ratio: 1.2,
    },
    profit_target_percentage: 5,
    stop_loss_percentage: 2,
    max_concurrent_trades: 3,
    price_check_interval: 5000,
  },
  volume_strategy: {
    enabled: true,
    pairs: [
      {
        base: "So11111111111111111111111111111111111111112", // SOL
        quote: "8HjiRvPNwFT9jpzAAsYF4rE9y576CKdTkQZXaxibpump", // DOVA
        volume_target: 1000,
        min_trade_size: 0.001,
        max_trade_size: 0.01,
        trade_interval: 5000,
        price_impact_limit: 1.0,
        spread_threshold: 0.5,
      }
    ],
    general: {
      max_slippage: 100,
      priority_fee: {
        max_lamports: 1000000,
        level: "medium"
      },
      retry_attempts: 3,
      retry_delay: 1000,
    }
  },
  liquidity_pool: {
    radiyum_program_id: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    wsol_pc_mint: "So11111111111111111111111111111111111111112",
  },
  tx: {
    fetch_tx_max_retries: 10,
    fetch_tx_initial_delay: 3000,
    swap_tx_initial_delay: 1000,
    get_timeout: 10000,
    concurrent_transactions: 1,
    retry_delay: 500,
  },
  swap: {
    verbose_log: false,
    prio_fee_max_lamports: 1000000,
    prio_level: "veryHigh",
    amount: "10000000",
    slippageBps: "200",
    db_name_tracker_holdings: "src/tracker/holdings.db",
    token_not_tradable_400_error_retries: 5,
    token_not_tradable_400_error_delay: 2000,
  },
  sell: {
    price_source: "dex",
    prio_fee_max_lamports: 1000000,
    prio_level: "veryHigh",
    slippageBps: "200",
    auto_sell: true,
    stop_loss_percent: 15,
    take_profit_percent: 50,
    track_public_wallet: "",
  },
  rug_check: {
    verbose_log: false,
    simulation_mode: false,
    allow_mint_authority: false,
    allow_not_initialized: false,
    allow_freeze_authority: false,
    allow_rugged: false,
    allow_mutable: false,
    block_returning_token_names: true,
    block_returning_token_creators: true,
    block_symbols: ["XXX"],
    block_names: ["XXX"],
    allow_insider_topholders: false,
    max_alowed_pct_topholders: 1,
    exclude_lp_from_topholders: false,
    min_total_markets: 999,
    min_total_lp_providers: 999,
    min_total_market_Liquidity: 1000000,
    ignore_pump_fun: true,
    max_score: 1,
    legacy_not_allowed: [
      "Low Liquidity",
      "Single holder ownership",
      "High holder concentration",
      "Freeze Authority still enabled",
      "Large Amount of LP Unlocked",
      "Copycat token",
      "Low amount of LP Providers",
    ],
  },
};