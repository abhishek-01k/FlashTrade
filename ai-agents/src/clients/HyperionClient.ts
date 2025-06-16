import { ethers } from "ethers";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("HyperionClient");

export interface TradeParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  useParallel?: boolean;
}

export interface LiquidityParams {
  pair: string;
  amountA: string;
  amountB: string;
}

/**
 * Client for interacting with FlashTrade contracts on Hyperion
 */
export class HyperionClient {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  // FlashTrade contract ABI (minimal for our needs)
  private readonly ABI = [
    "function trade(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external returns (uint256)",
    "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin) external returns (uint256, uint256, uint256)",
    "function getActivePairs() external view returns (bytes32[])",
    "function getPairDetails(bytes32 pairId) external view returns (tuple(address,address,uint256,uint256,uint256,bool,uint256,uint256))",
    "function getAIPrediction(bytes32 pairId) external view returns (tuple(uint256,uint256,uint256,uint256,bool))"
  ];

  constructor(
    private rpcUrl: string,
    private contractAddress: string,
    private privateKey: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, this.ABI, this.wallet);
  }

  async connect(): Promise<void> {
    try {
      // Test connection
      const network = await this.provider.getNetwork();
      logger.info(`Connected to Hyperion network: ${network.name} (${network.chainId})`);
      
      // Check wallet balance
      const balance = await this.provider.getBalance(this.wallet.address);
      logger.info(`Wallet balance: ${ethers.formatEther(balance)} METIS`);
      
    } catch (error) {
      logger.error("Failed to connect to Hyperion:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    logger.info("Disconnecting from Hyperion");
    // Cleanup if needed
  }

  /**
   * Execute a trade on FlashTrade DEX
   */
  async executeTrade(params: TradeParams): Promise<string> {
    try {
      logger.info(`Executing trade: ${params.amountIn} ${params.tokenIn} -> ${params.tokenOut}`);
      
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
      
      const tx = await this.contract.trade(
        params.tokenIn,
        params.tokenOut,
        params.amountIn,
        params.minAmountOut,
        deadline
      );
      
      logger.info(`Trade transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      logger.info(`Trade confirmed in block: ${receipt.blockNumber}`);
      
      return tx.hash;
      
    } catch (error) {
      logger.error("Trade execution failed:", error);
      throw error;
    }
  }

  /**
   * Add liquidity to a trading pair
   */
  async addLiquidity(params: LiquidityParams): Promise<string> {
    try {
      logger.info(`Adding liquidity to ${params.pair}: ${params.amountA} + ${params.amountB}`);
      
      const [tokenA, tokenB] = params.pair.split("/");
      
      const tx = await this.contract.addLiquidity(
        tokenA,
        tokenB,
        params.amountA,
        params.amountB,
        "0", // Min amounts (calculated by contract)
        "0"
      );
      
      logger.info(`Liquidity transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      logger.info(`Liquidity confirmed in block: ${receipt.blockNumber}`);
      
      return tx.hash;
      
    } catch (error) {
      logger.error("Add liquidity failed:", error);
      throw error;
    }
  }

  /**
   * Get all active trading pairs
   */
  async getActivePairs(): Promise<string[]> {
    try {
      const pairIds = await this.contract.getActivePairs();
      return pairIds.map((id: string) => id.toString());
    } catch (error) {
      logger.error("Failed to get active pairs:", error);
      return [];
    }
  }

  /**
   * Get pair details
   */
  async getPairDetails(pairId: string): Promise<any> {
    try {
      const details = await this.contract.getPairDetails(pairId);
      return {
        tokenA: details[0],
        tokenB: details[1],
        reserveA: details[2].toString(),
        reserveB: details[3].toString(),
        lastUpdateTime: Number(details[4]),
        isActive: details[5],
        totalLiquidity: details[6].toString(),
        feeRate: Number(details[7])
      };
    } catch (error) {
      logger.error("Failed to get pair details:", error);
      return null;
    }
  }

  /**
   * Get AI prediction for a pair
   */
  async getAIPrediction(pairId: string): Promise<any> {
    try {
      const prediction = await this.contract.getAIPrediction(pairId);
      return {
        predictedPrice: prediction[0].toString(),
        confidence: Number(prediction[1]),
        timestamp: Number(prediction[2]),
        liquidityNeeded: prediction[3].toString(),
        mevRisk: prediction[4]
      };
    } catch (error) {
      logger.error("Failed to get AI prediction:", error);
      return null;
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<bigint> {
    return await this.provider.getFeeData().then(fee => fee.gasPrice || 0n);
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    return this.wallet.address;
  }
} 