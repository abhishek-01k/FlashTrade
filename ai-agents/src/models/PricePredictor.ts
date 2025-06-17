import * as tf from "@tensorflow/tfjs-node";
import { logger } from "../utils/logger.js";

export interface PricePrediction {
  predictedPrice: number;
  confidence: number;
  trend: number; // -1 bearish, 0 neutral, 1 bullish
  volatility: number;
}

interface PredictorConfig {
  sequenceLength: number;
  hiddenUnits: number;
  learningRate: number;
}

interface TrainingData {
  sequences: number[][];
  targets: number[];
}

/**
 * CNN-LSTM model for cryptocurrency price prediction
 * Implements real machine learning for production use
 */
export class PricePredictor {
  private model: tf.Sequential | null = null;
  private isInitialized = false;
  private scaler: { min: number; max: number } | null = null;

  constructor(private config: PredictorConfig) {}

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing PricePredictor...');
      await this.buildModel();
      this.isInitialized = true;
      logger.info('PricePredictor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PricePredictor', { error });
      throw error;
    }
  }

  private async buildModel(): Promise<void> {
    // Create CNN-LSTM model for price prediction
    this.model = tf.sequential({
      layers: [
        // CNN layers for feature extraction
        tf.layers.conv1d({
          filters: 64,
          kernelSize: 3,
          activation: 'relu',
          inputShape: [this.config.sequenceLength, 1]
        }),
        tf.layers.conv1d({
          filters: 64,
          kernelSize: 3,
          activation: 'relu'
        }),
        tf.layers.maxPooling1d({ poolSize: 2 }),
        tf.layers.dropout({ rate: 0.25 }),

        // LSTM layers for sequence modeling
        tf.layers.lstm({
          units: this.config.hiddenUnits,
          returnSequences: true,
          dropout: 0.2,
          recurrentDropout: 0.2
        }),
        tf.layers.lstm({
          units: this.config.hiddenUnits / 2,
          dropout: 0.2,
          recurrentDropout: 0.2
        }),

        // Dense layers for final prediction
        tf.layers.dense({ units: 50, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.5 }),
        tf.layers.dense({ units: 1 }) // Single price output
      ]
    });

    // Compile the model
    this.model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError',
      metrics: ['meanAbsoluteError']
    });

    logger.info('CNN-LSTM model built successfully');
  }

  async train(data: TrainingData, epochs: number = 50): Promise<void> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    logger.info('Starting model training', { epochs, samples: data.sequences.length });

    // Prepare training data
    const { normalizedSequences, normalizedTargets } = this.normalizeData(data);

    // Convert to tensors with proper 3D shape for CNN-LSTM
    const xs = tf.tensor3d(normalizedSequences.map(seq => seq.map(val => [val])));
    const ys = tf.tensor2d(normalizedTargets.map(val => [val]));

    try {
      // Train the model
      const history = await this.model.fit(xs, ys, {
        epochs,
        batchSize: 32,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              logger.info(`Epoch ${epoch}: loss=${logs?.loss?.toFixed(4)}, val_loss=${logs?.val_loss?.toFixed(4)}`);
            }
          }
        }
      });

      logger.info('Model training completed', {
        finalLoss: history.history.loss[history.history.loss.length - 1],
        finalValLoss: history.history.val_loss[history.history.val_loss.length - 1]
      });
    } finally {
      // Clean up tensors
      xs.dispose();
      ys.dispose();
    }
  }

  async predict(priceSequence: number[]): Promise<number> {
    if (!this.model || !this.isInitialized) {
      throw new Error('Model not initialized');
    }

    if (priceSequence.length !== this.config.sequenceLength) {
      // If we have less data, pad with the last known value
      const paddedSequence = [...priceSequence];
      while (paddedSequence.length < this.config.sequenceLength) {
        paddedSequence.unshift(priceSequence[0] || 0);
      }
      // If we have more data, take the last N values
      const sequence = paddedSequence.slice(-this.config.sequenceLength);
      
      return this.predict(sequence);
    }

    try {
      // Normalize the input sequence
      const normalizedSequence = this.normalizeSequence(priceSequence);

      // Convert to tensor with proper 3D shape
      const inputTensor = tf.tensor3d([normalizedSequence.map(val => [val])]);

      // Make prediction
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const predictionValue = await prediction.data();

      // Denormalize the prediction
      const denormalizedPrediction = this.denormalizePrediction(predictionValue[0]);

      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

      return denormalizedPrediction;
    } catch (error) {
      logger.error('Prediction failed', { error });
      throw error;
    }
  }

  private normalizeData(data: TrainingData): {
    normalizedSequences: number[][];
    normalizedTargets: number[];
  } {
    // Find min/max for normalization
    const allValues = data.sequences.flat().concat(data.targets);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);

    this.scaler = { min, max };

    // Normalize sequences and targets
    const normalizedSequences = data.sequences.map(seq =>
      seq.map(val => this.normalize(val))
    );
    const normalizedTargets = data.targets.map(val => this.normalize(val));

    return { normalizedSequences, normalizedTargets };
  }

  private normalizeSequence(sequence: number[]): number[] {
    if (!this.scaler) {
      // If no scaler, create one from the current sequence
      const min = Math.min(...sequence);
      const max = Math.max(...sequence);
      this.scaler = { min: min * 0.9, max: max * 1.1 }; // Add some buffer
    }

    return sequence.map(val => this.normalize(val));
  }

  private normalize(value: number): number {
    if (!this.scaler) return value;
    return (value - this.scaler.min) / (this.scaler.max - this.scaler.min);
  }

  private denormalizePrediction(normalizedValue: number): number {
    if (!this.scaler) return normalizedValue;
    return normalizedValue * (this.scaler.max - this.scaler.min) + this.scaler.min;
  }

  async saveModel(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    await this.model.save(`file://${path}`);
    logger.info('Model saved', { path });
  }

  async loadModel(path: string): Promise<void> {
    this.model = await tf.loadLayersModel(`file://${path}`) as tf.Sequential;
    this.isInitialized = true;
    logger.info('Model loaded', { path });
  }

  getModelSummary(): string {
    if (!this.model) {
      return 'Model not initialized';
    }

    const summary: string[] = [];
    this.model.summary(undefined, undefined, (line: string) => {
      summary.push(line);
    });

    return summary.join('\n');
  }

  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this.isInitialized = false;
      logger.info('PricePredictor disposed');
    }
  }
} 