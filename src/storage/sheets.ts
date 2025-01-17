import { createLogger } from "./../utils/logger.js";
import {
  GoogleSpreadsheet,
  GoogleSpreadsheetWorksheet,
} from "google-spreadsheet";
import { transactionRow } from "./index.js";
import { FileHeaders, GOOGLE_SHEET_ID, worksheetName } from "./../config.js";
import type {
  TransactionRow,
  TransactionStorage,
  SaveStats,
} from "../types.js";
import { TransactionStatuses } from "israeli-bank-scrapers/lib/transactions.js";

const logger = createLogger("GoogleSheetsStorage");

export class GoogleSheetsStorage implements TransactionStorage {
  existingTransactionsHashes = new Set<string>();

  private initPromise: null | Promise<void> = null;

  private sheet: null | GoogleSpreadsheetWorksheet = null;

  async init() {
    // Init only once
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.initDocAndSheet();
        await this.loadHashes();
      })();
    }

    await this.initPromise;
  }

  async saveTransactions(txns: Array<TransactionRow>) {
    const rows: string[][] = [];
    await this.init();

    const stats: SaveStats = {
      name: "Google Sheets",
      sheetName: worksheetName,
      replaced: 0, // TODO
      total: txns.length,
      added: 0,
      pending: 0,
      existing: 0,
    };

    for (let tx of txns) {
      if (this.existingTransactionsHashes.has(tx.hash)) {
        stats.existing++;
        continue;
      }

      if (tx.status === TransactionStatuses.Pending) {
        // TODO: Add pending rows and edit the saved row?
        stats.pending++;
        continue;
      }

      stats.added++;
      rows.push(transactionRow(tx));
    }

    if (rows.length) {
      await this.sheet?.addRows(rows);
    }

    return stats;
  }

  private async loadHashes() {
    const rows = await this.sheet?.getRows();
    for (let row of rows!) {
      this.existingTransactionsHashes.add(row.hash);
    }
    logger(`${this.existingTransactionsHashes.size} hashes loaded`);
  }

  private async initDocAndSheet() {
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID);

    const {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: client_email,
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: private_key,
    } = process.env;

    if (client_email && private_key) {
      logger("Using ServiceAccountAuth");
      await doc.useServiceAccountAuth({
        client_email,
        private_key,
      });
    }

    await doc.loadInfo();

    if (!(worksheetName in doc.sheetsByTitle)) {
      logger("Creating new sheet");
      const sheet = await doc.addSheet({ title: worksheetName });
      await sheet.setHeaderRow(FileHeaders);
    }

    this.sheet = doc.sheetsByTitle[worksheetName];
  }
}
