import { PriceData, MACDResult, IndicatorConfig } from './types.ts';
import { MovingAverage } from './MovingAverage.ts';

export class MACD {
  private fastEMA: MovingAverage;
  private slowEMA: MovingAverage;
  private signalEMA: MovingAverage;

  constructor(config: IndicatorConfig) {
    this.fastEMA = new MovingAverage({ period: 12, ...config });
    this.slowEMA = new MovingAverage({ period: 26, ...config });
    this.signalEMA = new MovingAverage({ period: 9, ...config });
  }

  calculate(data: PriceData[]): MACDResult {
    const fastEMA = this.fastEMA.calculate(data);
    const slowEMA = this.slowEMA.calculate(data);
    const macd = fastEMA[fastEMA.length - 1].value - slowEMA[slowEMA.length - 1].value;

    const signalData = data.map((d, i) => ({
      price: macd,
      volume: d.volume,
      timestamp: d.timestamp
    }));

    const signal = this.signalEMA.calculate(signalData)[0]?.value || 0;
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }
}
