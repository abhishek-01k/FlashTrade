import { PricePredictor } from '../models/PricePredictor.js';
import { HyperionClient } from '../clients/HyperionClient.js';
import { logger } from '../utils/logger.js';

// Placeholder interface for Alith Agent
interface AlithAgent {
  name: string;
  initialize(): Promise<void>;
  processMessage(message: string): Promise<string>;
  addTool(tool: any): void;
}

interface TradingDecision {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  amount?: number;
  reason: string;
}

interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
  high24h?: number;
  low24h?: number;
  change24h?: number;
}

interface TradingContext {
  marketData: MarketData;
  prediction: number;
  confidence: number;
  portfolio: {
    balance: number;
    positions: Array<{
      symbol: string;
      amount: number;
      value: number;
    }>;
  };
}

export class TradingAgent {
  private predictor: PricePredictor;
  private hyperionClient: HyperionClient;
  private agent: AlithAgent | null = null;
  private isInitialized = false;

  constructor(
    private readonly config: {
      name: string;
      riskTolerance: number;
      maxPositionSize: number;
      minConfidence: number;
    }
  ) {
    this.predictor = new PricePredictor({
      sequenceLength: 60,
      hiddenUnits: 50,
      learningRate: 0.001
    });
    
    this.hyperionClient = new HyperionClient({
      rpcUrl: process.env.HYPERION_RPC_URL || 'https://hyperion-testnet.metisdevops.link',
      privateKey: process.env.PRIVATE_KEY || '',
      contractAddress: process.env.FLASHTRADE_CONTRACT || ''
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing TradingAgent...', { name: this.config.name });

      // Initialize AI predictor
      await this.predictor.initialize();
      logger.info('Price predictor initialized');

      // Initialize Hyperion client
      await this.hyperionClient.initialize();
      logger.info('Hyperion client initialized');

      // Initialize Alith agent (placeholder implementation)
      this.agent = await this.createAlithAgent();
      await this.agent.initialize();
      logger.info('Alith agent initialized');

      this.isInitialized = true;
      logger.info('TradingAgent fully initialized');
    } catch (error) {
      logger.error('Failed to initialize TradingAgent', { error });
      throw error;
    }
  }

  private async createAlithAgent(): Promise<AlithAgent> {
    // Placeholder implementation for Alith agent
    // In production, this would use the actual Alith SDK
    return {
      name: this.config.name,
      async initialize() {
        // Initialize Alith agent
      },
      async processMessage(message: string) {
        // Process message with Alith
        return `Processed: ${message}`;
      },
      addTool(tool: any) {
        // Add tool to Alith agent
      }
    };
  }

  async analyzeMarket(symbol: string): Promise<TradingDecision> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized');
    }

    try {
      logger.info('Analyzing market', { symbol });

      // Get current market data
      const marketData = await this.getMarketData(symbol);
      
      // Get AI prediction
      const prediction = await this.predictor.predict([marketData.price]);
      const confidence = await this.calculateConfidence(marketData, prediction);

      // Create trading context
      const context: TradingContext = {
        marketData,
        prediction,
        confidence,
        portfolio: await this.getPortfolioStatus()
      };

      // Make trading decision
      const decision = await this.makeDecision(context);
      
      logger.info('Market analysis complete', {
        symbol,
        decision: decision.action,
        confidence: decision.confidence
      });

      return decision;
    } catch (error) {
      logger.error('Market analysis failed', { symbol, error });
      throw error;
    }
  }

  private async getMarketData(symbol: string): Promise<MarketData> {
    // In production, this would fetch from real market data API
    const mockPrice = 100 + Math.random() * 10; // Mock price data
    
    return {
      symbol,
      price: mockPrice,
      volume: Math.random() * 1000000,
      timestamp: Date.now(),
      high24h: mockPrice * 1.05,
      low24h: mockPrice * 0.95,
      change24h: (Math.random() - 0.5) * 0.1
    };
  }

  private async calculateConfidence(marketData: MarketData, prediction: number): Promise<number> {
    // Calculate confidence based on various factors
    const volatility = Math.abs((marketData.high24h || marketData.price) - (marketData.low24h || marketData.price)) / marketData.price;
    const priceDirection = Math.sign(prediction - marketData.price);
    const trendConfidence = Math.abs(marketData.change24h || 0) > 0.02 ? 0.8 : 0.6;
    
    // Combine factors to get overall confidence
    const baseConfidence = Math.max(0.1, 1 - volatility);
    return Math.min(0.95, baseConfidence * trendConfidence);
  }

  private async getPortfolioStatus() {
    // Mock portfolio data - in production would fetch from blockchain
    return {
      balance: 1000,
      positions: [
        { symbol: 'ETH', amount: 0.5, value: 1600 },
        { symbol: 'METIS', amount: 100, value: 3500 }
      ]
    };
  }

  private async makeDecision(context: TradingContext): Promise<TradingDecision> {
    const { marketData, prediction, confidence, portfolio } = context;
    
    // Check minimum confidence threshold
    if (confidence < this.config.minConfidence) {
      return {
        action: 'hold',
        confidence,
        reason: `Confidence ${confidence.toFixed(2)} below threshold ${this.config.minConfidence}`
      };
    }

    const priceChange = (prediction - marketData.price) / marketData.price;
    const expectedProfit = Math.abs(priceChange);

    // Risk management
    const riskAdjustedAmount = this.calculatePositionSize(portfolio.balance, confidence);

    if (priceChange > 0.02 && expectedProfit > 0.01) {
      return {
        action: 'buy',
        confidence,
        amount: riskAdjustedAmount,
        reason: `Predicted price increase of ${(priceChange * 100).toFixed(2)}%`
      };
    } else if (priceChange < -0.02 && expectedProfit > 0.01) {
      return {
        action: 'sell',
        confidence,
        amount: riskAdjustedAmount,
        reason: `Predicted price decrease of ${(priceChange * 100).toFixed(2)}%`
      };
    }

    return {
      action: 'hold',
      confidence,
      reason: `Price change ${(priceChange * 100).toFixed(2)}% insufficient for action`
    };
  }

  private calculatePositionSize(balance: number, confidence: number): number {
    const maxRisk = balance * this.config.riskTolerance;
    const confidenceAdjusted = maxRisk * confidence;
    return Math.min(confidenceAdjusted, balance * this.config.maxPositionSize);
  }

  async executeTrade(decision: TradingDecision, symbol: string): Promise<boolean> {
    if (decision.action === 'hold') {
      logger.info('No action required', { symbol, decision });
      return true;
    }

    try {
      logger.info('Executing trade', { symbol, decision });

      const success = await this.hyperionClient.executeTrade({
        action: decision.action,
        symbol,
        amount: decision.amount || 0,
        maxSlippage: 0.005 // 0.5% max slippage
      });

      if (success) {
        logger.info('Trade executed successfully', { symbol, decision });
      } else {
        logger.error('Trade execution failed', { symbol, decision });
      }

      return success;
    } catch (error) {
      logger.error('Trade execution error', { symbol, decision, error });
      return false;
    }
  }

  async startTrading(symbols: string[], intervalMs: number = 30000): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized');
    }

    logger.info('Starting automated trading', { symbols, intervalMs });

    const tradingLoop = async () => {
      for (const symbol of symbols) {
        try {
          const decision = await this.analyzeMarket(symbol);
          await this.executeTrade(decision, symbol);
          
          // Small delay between symbols
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error('Trading loop error', { symbol, error });
        }
      }
    };

    // Initial run
    await tradingLoop();

    // Set up interval
    setInterval(tradingLoop, intervalMs);
  }

  async stop(): Promise<void> {
    logger.info('Stopping TradingAgent', { name: this.config.name });
    this.isInitialized = false;
  }

  getStatus() {
    return {
      name: this.config.name,
      initialized: this.isInitialized,
      config: this.config
    };
  }
} 