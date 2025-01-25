import { Database } from "jsr:@db/sqlite@0.12";
import { config } from "../../config.ts";
import { HoldingRecord, NewTokenRecord } from "../../core/types/Tracker.ts";
import { Logger } from "jsr:@deno-library/logger";

export class TrackerService {
  private logger = new Logger();
  private db: Database | null = null;

  async init() {
    try {
      this.db = new Database(config.swap.db_name_tracker_holdings);
      await this.createHoldingsTable();
      await this.createNewTokensTable();
      return true;
    } catch (error) {
      this.logger.error("Failed to initialize tracker:", error);
      return false;
    }
  }

  private async createHoldingsTable(): Promise<boolean> {
    if (!this.db) return false;
    
    try {
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS holdings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          Time INTEGER NOT NULL,
          Token TEXT NOT NULL,
          TokenName TEXT NOT NULL,
          Balance REAL NOT NULL,
          SolPaid REAL NOT NULL,
          SolFeePaid REAL NOT NULL,
          SolPaidUSDC REAL NOT NULL,
          SolFeePaidUSDC REAL NOT NULL,
          PerTokenPaidUSDC REAL NOT NULL,
          Slot INTEGER NOT NULL,
          Program TEXT NOT NULL
        );
      `).run();
      return true;
    } catch (error) {
      this.logger.error("Failed to create holdings table:", error);
      return false;
    }
  }

  private async createNewTokensTable(): Promise<boolean> {
    if (!this.db) return false;

    try {
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          time INTEGER NOT NULL,
          name TEXT NOT NULL,
          mint TEXT NOT NULL,
          creator TEXT NOT NULL
        );
      `).run();
      return true;
    } catch (error) {
      this.logger.error("Failed to create tokens table:", error);
      return false;
    }
  }

  async insertHolding(holding: HoldingRecord): Promise<boolean> {
    if (!this.db) return false;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO holdings (
          Time, Token, TokenName, Balance, SolPaid, 
          SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, 
          PerTokenPaidUSDC, Slot, Program
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run(
        holding.Time,
        holding.Token,
        holding.TokenName,
        holding.Balance,
        holding.SolPaid,
        holding.SolFeePaid,
        holding.SolPaidUSDC,
        holding.SolFeePaidUSDC,
        holding.PerTokenPaidUSDC,
        holding.Slot,
        holding.Program
      );
      return true;
    } catch (error) {
      this.logger.error("Failed to insert holding:", error);
      return false;
    }
  }

  async insertNewToken(token: NewTokenRecord): Promise<boolean> {
    if (!this.db) return false;

    try {
      const stmt = this.db.prepare(
        `INSERT INTO tokens (time, name, mint, creator)
         VALUES (?, ?, ?, ?)`
      );

      stmt.run(token.time, token.name, token.mint, token.creator);
      return true;
    } catch (error) {
      this.logger.error("Failed to insert new token:", error);
      return false;
    }
  }

  async removeHolding(tokenMint: string): Promise<boolean> {
    if (!this.db) return false;

    try {
      this.db.prepare('DELETE FROM holdings WHERE Token = ?').run(tokenMint);
      return true;
    } catch (error) {
      this.logger.error("Failed to remove holding:", error);
      return false;
    }
  }

  async getAllHoldings(): Promise<HoldingRecord[]> {
    if (!this.db) return [];

    try {
      return this.db.prepare('SELECT * FROM holdings').all() as HoldingRecord[];
    } catch (error) {
      this.logger.error("Failed to get holdings:", error);
      return [];
    }
  }

  async findTokenByMint(mint: string): Promise<NewTokenRecord[]> {
    if (!this.db) return [];

    try {
      return this.db.prepare('SELECT * FROM tokens WHERE mint = ?')
        .all(mint) as NewTokenRecord[];
    } catch (error) {
      this.logger.error("Failed to find token:", error);
      return [];
    }
  }

  async findTokensByNameOrCreator(name: string, creator: string): Promise<NewTokenRecord[]> {
    if (!this.db) return [];

    try {
      return this.db.prepare('SELECT * FROM tokens WHERE name = ? OR creator = ?')
        .all(name, creator) as NewTokenRecord[];
    } catch (error) {
      this.logger.error("Failed to find tokens:", error);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}