# BirdEye API Integration

## Overview
This TypeScript application integrates with BirdEye API on the Solana blockchain, providing token data analysis, trend tracking, trader monitoring, and holder analysis with Discord notifications.

---

## 🚀 Quick Start

### Installation
```bash
Clone repo

# Install dependencies
npm install

# Create and configure environment variables
cp .env.example .env
```

### Configuration
Add your credentials to `.env`:
```env
BIRDEYE_API_KEY=your_api_key_here
BIRDEYE_BASE_URL=https://public-api.birdeye.so
CHAIN=solana
DISCORD_WEBHOOK_URL=your_discord_webhook_url
DISCORD_ENABLED=true
```

---

## 📊 Available Commands

### 1️⃣ Token List Analysis
```bash
# Get top 50 tokens
npm start -- --endpoint tokenlist

# Custom limit and sorting
npm start -- --endpoint tokenlist --limit 20 --sortBy v24hUSD
```
**Options**:
- `--limit`: 1-50 tokens
- `--sortBy`: `v24hUSD`, `liquidity`
- `--sortType`: `asc`, `desc`

---

### 2️⃣ Top Traders Tracking
```bash
# Default 24h traders
npm start -- --endpoint toptraders

# Custom timeframe
npm start -- --endpoint toptraders --timeFrame 1h --limit 10
```
**Options**:
- `--timeFrame`: `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `24h`
- `--limit`: 1-10 traders
- `--sortBy`: `volume`, `trade`

---

### 3️⃣ Trending Tokens
```bash
# Get trending tokens
npm start -- --endpoint trending

# Custom sorting and limit
npm start -- --endpoint trending --sortBy volume24hUSD --limit 15
```
**Options**:
- `--sortBy`: `rank`, `volume24hUSD`, `liquidity`
- `--limit`: 1-20 tokens
- `--sortType`: `asc`, `desc`

---

### 4️⃣ Token Holders Analysis
```bash
# Get holder distribution
npm start -- --endpoint holders --address TOKEN_ADDRESS

# Limit results
npm start -- --endpoint holders --address TOKEN_ADDRESS --limit 50
```
**Options**:
- `--address`: Token address (required)
- `--limit`: 1-100 holders

---

## 📝 Common Use Cases

### Token Market Analysis
```bash
# Volume leaders
npm start -- --endpoint tokenlist --sortBy v24hUSD --limit 10

# Liquidity analysis
npm start -- --endpoint tokenlist --sortBy liquidity --limit 20
```

### Trading Activity
```bash
# Hourly analysis
npm start -- --endpoint toptraders --timeFrame 1h --limit 5

# Daily overview
npm start -- --endpoint toptraders --timeFrame 24h --limit 10
```

### Holder Distribution
```bash
# Quick overview
npm start -- --endpoint holders --address So11111111111111111111111111111111111111112 --limit 10

# Detailed analysis
npm start -- --endpoint holders --address TOKEN_ADDRESS --limit 100
```

### Trend Analysis
```bash
# By ranking
npm start -- --endpoint trending --sortBy rank --limit 20

# By volume
npm start -- --endpoint trending --sortBy volume24hUSD --limit 15
```

---

## 📁 Data Output
**Log Files Location**:
- **Token List**: `logs/token_data_TIMESTAMP.json`
- **Top Traders**: `logs/top_traders_TIMESTAMP.json`
- **Trending**: `logs/trending_tokens_TIMESTAMP.json`
- **Holders**: `logs/token_holders_ADDRESS_TIMESTAMP.json`

---

## Discord Integration
All data is automatically posted to Discord (if configured) with:
- Formatted embeds
- Color-coded information
- Detailed metrics
- Real-time updates

---

## ⚠️ Error Handling

### Common Issues
```bash
# Missing token address
Error: Token address is required for holders endpoint
Solution: npm start -- --endpoint holders --address YOUR_TOKEN_ADDRESS

# Invalid timeframe
Error: Invalid timeFrame
Solution: npm start -- --endpoint toptraders --timeFrame 24h
```

### Troubleshooting

#### Discord Integration
If Discord messages aren't appearing:
- Verify webhook URL in `.env`
- Check `DISCORD_ENABLED=true`
- Confirm webhook permissions
- Monitor console for errors

#### Rate Limiting
- Implement reasonable delays between requests
- Monitor API response headers
- Handle rate limit errors gracefully

---

## 📋 Best Practices

### Data Management
- Regular log cleanup
- Monitoring disk usage
- Backup important data

### API Usage
- Implement error handling
- Use appropriate limits
- Monitor rate limits

### Discord Integration
- Set up separate channels for different data types
- Configure appropriate webhook permissions
- Monitor webhook rate limits

---

## 🏃 Quick Start Examples

### Basic Commands
```bash
# Top tokens
npm start -- --endpoint tokenlist --limit 10

# Latest trends
npm start -- --endpoint trending

# SOL holders
npm start -- --endpoint holders --address So11111111111111111111111111111111111111112

# 24h traders
npm start -- --endpoint toptraders --timeFrame 24h
```

---

## 📚 Additional Resources
- [BirdEye API Documentation](https://public-api.birdeye.so)
- [Discord Webhook Guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)
- [Solana Documentation](https://solana.com/)
