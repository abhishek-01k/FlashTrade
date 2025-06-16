import { Agent, Client } from "alith";
import { ethers } from "ethers";
import { z } from "zod";
import { createLogger } from "../utils/logger.js";
import { MarketDataProvider } from "../providers/MarketDataProvider.js";
import { HyperionClient } from "../clients/HyperionClient.js";
import { PricePredictor } from "../models/PricePredictor.js";
import { LiquidityOptimizer } from "../models/LiquidityOptimizer.js";
import { MEVDetector } from "../models/MEVDetector.js";

const logger = createLogger("TradingAgent");

// Schemas for type safety
const MarketDataSchema = z.object({
  pair: z.string(),
  reserveA: z.string(),
  reserveB: z.string(),
  price: z.number(),
  volume24h: z.number(),
  timestamp: z.number()
});

const TradingSignalSchema = z.object({
  action: z.enum(["BUY", "SELL", "HOLD", "ADD_LIQUIDITY"]),
  confidence: z.number().min(0).max(100),
  amount: z.string().optional(),
  expectedPrice: z.number(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  mevRisk: z.boolean()
});

export type MarketData = z.infer<typeof MarketDataSchema>;
export type TradingSignal = z.infer<typeof TradingSignalSchema>;

/**
 * AI Trading Agent powered by Alith for FlashTrade DEX
 * Provides price predictions, market making, and MEV resistance
 */
export class TradingAgent {
  private agent: Agent;
  private client: Client;
  private marketDataProvider: MarketDataProvider;
  private hyperionClient: HyperionClient;
  private pricePredictor: PricePredictor;
  private liquidityOptimizer: LiquidityOptimizer;
  private mevDetector: MEVDetector;
  private isRunning: boolean = false;

  constructor(
    private config: {
      alithApiKey: string;
      hyperionRpc: string;
      contractAddress: string;
      privateKey: string;
      updateInterval: number;
    }
  ) {
    // Initialize Alith client
    this.client = new Client({
      apiKey: config.alithApiKey,
      endpoint: "https://api.alith.ai" // Production endpoint
    });

    // Initialize AI models
    this.pricePredictor = new PricePredictor();
    this.liquidityOptimizer = new LiquidityOptimizer();
    this.mevDetector = new MEVDetector();

    // Initialize market data provider
    this.marketDataProvider = new MarketDataProvider();
    
    // Initialize Hyperion client
    this.hyperionClient = new HyperionClient(
      config.hyperionRpc,
      config.contractAddress,
      config.privateKey
    );

    // Configure AI agent
    this.agent = new Agent({
      client: this.client,
      model: "gpt-4o-mini", // Use available model
      preamble: `You are an expert AI trader for FlashTrade DEX on Metis Hyperion.
        
        Your role:
        1. Analyze real-time market data from multiple sources
        2. Generate accurate price predictions using CNN-LSTM models
        3. Optimize liquidity provision using Graph Neural Networks
        4. Detect and prevent MEV attacks using transformer models
        5. Execute profitable trades while minimizing risk
        
        You have access to:
        - Real-time market data from Hyperion and external sources
        - Historical price and volume data
        - On-chain liquidity metrics
        - MEV detection algorithms
        - Parallel execution capabilities for optimal trade routing
        
        Always prioritize:
        - Risk management and user protection
        - Profitable opportunities with high confidence
        - MEV resistance through parallel execution
        - Optimal liquidity provisioning
        
        Respond with specific, actionable trading recommendations based on data analysis.`,
      
      tools: [
        {
          name: "analyze_market_data",
          description: "Analyze current market conditions and generate trading signals",
          parameters: {
            type: "object",
            properties: {
              marketData: {
                type: "object",
                description: "Current market data for analysis"
              }
            },
            required: ["marketData"]
          }
        },
        {
          name: "predict_price_movement",
          description: "Predict future price movements using AI models",
          parameters: {
            type: "object",
            properties: {
              pair: { type: "string" },
              timeframe: { type: "string" },
              historicalData: { type: "array" }
            },
            required: ["pair", "timeframe"]
          }
        },
        {
          name: "optimize_liquidity",
          description: "Calculate optimal liquidity provision amounts",
          parameters: {
            type: "object",
            properties: {
              pair: { type: "string" },
              availableA: { type: "string" },
              availableB: { type: "string" },
              targetAPY: { type: "number" }
            },
            required: ["pair", "availableA", "availableB"]
          }
        },
        {
          name: "detect_mev_risk",
          description: "Analyze transaction for MEV risks",
          parameters: {
            type: "object",
            properties: {
              transactionData: { type: "object" },
              mempool: { type: "array" }
            },
            required: ["transactionData"]
          }
        },
        {
          name: "execute_trade",
          description: "Execute a trade on FlashTrade DEX",
          parameters: {
            type: "object",
            properties: {
              tokenIn: { type: "string" },
              tokenOut: { type: "string" },
              amountIn: { type: "string" },
              minAmountOut: { type: "string" },
              useParallel: { type: "boolean" }
            },
            required: ["tokenIn", "tokenOut", "amountIn", "minAmountOut"]
          }
        }
      ]
    });

    this.setupToolHandlers();
  }

  /**
   * Start the trading agent
   */
  async start(): Promise<void> {
    logger.info("Starting FlashTrade AI Trading Agent...");
    this.isRunning = true;

    // Initialize connections
    await this.hyperionClient.connect();
    await this.marketDataProvider.connect();

    // Start monitoring and trading loop
    this.startTradingLoop();

    logger.info("Trading Agent started successfully");
  }

  /**
   * Stop the trading agent
   */
  async stop(): Promise<void> {
    logger.info("Stopping Trading Agent...");
    this.isRunning = false;
    
    await this.hyperionClient.disconnect();
    await this.marketDataProvider.disconnect();
    
    logger.info("Trading Agent stopped");
  }

  /**
   * Main trading loop - analyzes market and executes strategies
   */
  private async startTradingLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Get current market data
        const marketData = await this.marketDataProvider.getAllMarketData();
        
        // Analyze each active trading pair
        for (const market of marketData) {
          const signal = await this.analyzeMarketAndGenerateSignal(market);
          
          if (signal.confidence > 70) { // High confidence threshold
            await this.executeTradingSignal(signal, market);
          }
        }

        // Wait for next iteration
        await new Promise(resolve => setTimeout(resolve, this.config.updateInterval));
        
      } catch (error) {
        logger.error("Error in trading loop:", error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Error backoff
      }
    }
  }

  /**
   * Analyze market data and generate trading signal using AI
   */
  private async analyzeMarketAndGenerateSignal(marketData: MarketData): Promise<TradingSignal> {
    try {
      // Get AI analysis
      const response = await this.agent.run(
        `Analyze the following market data and provide a trading recommendation:
        
        Market: ${marketData.pair}
        Reserve A: ${marketData.reserveA}
        Reserve B: ${marketData.reserveB}
        Current Price: $${marketData.price}
        24h Volume: $${marketData.volume24h}
        Timestamp: ${new Date(marketData.timestamp * 1000).toISOString()}
        
        Please analyze this data and provide a specific trading recommendation with confidence level.`,
        
        { marketData }
      );

      // Parse AI response into structured signal
      return this.parseAIResponse(response.content, marketData);
      
    } catch (error) {
      logger.error("Error generating trading signal:", error);
      
      // Fallback to basic analysis
      return this.generateFallbackSignal(marketData);
    }
  }

  /**
   * Execute trading signal
   */
  private async executeTradingSignal(signal: TradingSignal, marketData: MarketData): Promise<void> {
    logger.info(`Executing trading signal: ${signal.action} for ${marketData.pair}`);

    try {
      switch (signal.action) {
        case "BUY":
        case "SELL":
          await this.executeTrade(signal, marketData);
          break;
          
        case "ADD_LIQUIDITY":
          await this.addLiquidity(signal, marketData);
          break;
          
        case "HOLD":
          logger.info(`Holding position for ${marketData.pair}`);
          break;
      }
    } catch (error) {
      logger.error("Error executing trading signal:", error);
    }
  }

  /**
   * Execute a trade using the AI signal
   */
  private async executeTrade(signal: TradingSignal, marketData: MarketData): Promise<void> {
    const [tokenA, tokenB] = marketData.pair.split("/");
    
    const tradeParams = {
      tokenIn: signal.action === "BUY" ? tokenB : tokenA,
      tokenOut: signal.action === "BUY" ? tokenA : tokenB,
      amountIn: signal.amount || "1000000000000000000", // 1 token default
      minAmountOut: "0", // Will be calculated
      useParallel: signal.mevRisk
    };

    await this.hyperionClient.executeTrade(tradeParams);
    
    logger.info(`Executed ${signal.action} for ${marketData.pair} with confidence ${signal.confidence}%`);
  }

  /**
   * Add liquidity based on AI optimization
   */
  private async addLiquidity(signal: TradingSignal, marketData: MarketData): Promise<void> {
    const optimizedAmounts = await this.liquidityOptimizer.calculateOptimalAmounts(
      marketData,
      signal.expectedPrice
    );

    await this.hyperionClient.addLiquidity({
      pair: marketData.pair,
      amountA: optimizedAmounts.amountA,
      amountB: optimizedAmounts.amountB
    });

    logger.info(`Added optimized liquidity for ${marketData.pair}`);
  }

  /**
   * Setup tool handlers for AI agent
   */
  private setupToolHandlers(): void {
    // Market analysis tool
    this.agent.addToolHandler("analyze_market_data", async (params: any) => {
      const marketData = MarketDataSchema.parse(params.marketData);
      
      // Use AI models for analysis
      const pricePrediction = await this.pricePredictor.predict(marketData);
      const liquidityAnalysis = await this.liquidityOptimizer.analyze(marketData);
      const mevRisk = await this.mevDetector.assessRisk(marketData);

      return {
        pricePrediction,
        liquidityAnalysis,
        mevRisk,
        recommendation: this.generateRecommendation(pricePrediction, liquidityAnalysis, mevRisk)
      };
    });

    // Price prediction tool
    this.agent.addToolHandler("predict_price_movement", async (params: any) => {
      return await this.pricePredictor.predictMovement(
        params.pair,
        params.timeframe,
        params.historicalData
      );
    });

    // Liquidity optimization tool
    this.agent.addToolHandler("optimize_liquidity", async (params: any) => {
      return await this.liquidityOptimizer.optimize(
        params.pair,
        params.availableA,
        params.availableB,
        params.targetAPY
      );
    });

    // MEV detection tool
    this.agent.addToolHandler("detect_mev_risk", async (params: any) => {
      return await this.mevDetector.detect(
        params.transactionData,
        params.mempool
      );
    });

    // Trade execution tool
    this.agent.addToolHandler("execute_trade", async (params: any) => {
      return await this.hyperionClient.executeTrade(params);
    });
  }

  /**
   * Parse AI response into structured trading signal
   */
  private parseAIResponse(response: string, marketData: MarketData): TradingSignal {
    // Enhanced parsing logic would go here
    // For now, return a basic signal
    return {
      action: "HOLD",
      confidence: 50,
      expectedPrice: marketData.price,
      riskLevel: "MEDIUM",
      mevRisk: false
    };
  }

  /**
   * Generate fallback signal when AI analysis fails
   */
  private generateFallbackSignal(marketData: MarketData): TradingSignal {
    return {
      action: "HOLD",
      confidence: 30,
      expectedPrice: marketData.price,
      riskLevel: "HIGH",
      mevRisk: false
    };
  }

  /**
   * Generate recommendation based on AI model outputs
   */
  private generateRecommendation(
    pricePrediction: any,
    liquidityAnalysis: any,
    mevRisk: any
  ): TradingSignal {
    // Complex recommendation logic based on AI outputs
    return {
      action: pricePrediction.trend > 0 ? "BUY" : "SELL",
      confidence: Math.min(pricePrediction.confidence, liquidityAnalysis.confidence),
      expectedPrice: pricePrediction.predictedPrice,
      riskLevel: mevRisk.level,
      mevRisk: mevRisk.detected
    };
  }
} 