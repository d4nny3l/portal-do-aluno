import { DatabaseSync } from "node:sqlite";
class MemoryD1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new MemoryD1Statement(this.database, this.sql, bindings);
  }

  all() {
    this.database.trace.push(this.sql);
    this.database.maybeFail(this.sql);
    return { results: this.database.sqlite.prepare(this.sql).all(...this.bindings), success: true };
  }

  first() {
    this.database.trace.push(this.sql);
    this.database.maybeFail(this.sql);
    return this.database.sqlite.prepare(this.sql).get(...this.bindings) ?? null;
  }

  run() {
    this.database.trace.push(this.sql);
    this.database.maybeFail(this.sql);
    const result = this.database.sqlite.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
    };
  }
}

class MemoryD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.trace=[];
    this.failNextSchemaWrite = false;
    this.failNextPeriodWrite = false;
  }

  prepare(sql) {
    return new MemoryD1Statement(this, sql);
  }

  async batch(statements) {
    if(this.beforeBatch){const hook=this.beforeBatch;this.beforeBatch=null;await hook();}
    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map(statement => this.sqlite.prepare(statement.sql).columns().length ? statement.all() : statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  maybeFail(sql) {
    if(this.failSqlMatch&&sql.includes(this.failSqlMatch)){this.failSqlMatch=null;throw new Error("D1_ERROR: synthetic transaction failure");}
    if (this.failNextSchemaWrite && sql.includes("CREATE TABLE IF NOT EXISTS salta_diario_classes")) {
      this.failNextSchemaWrite = false;
      throw new Error("D1_ERROR: synthetic schema failure with private marker DO_NOT_LOG");
    }
    if (this.failNextPeriodWrite && sql.includes("INSERT INTO salta_diario_periods")) {
      this.failNextPeriodWrite = false;
      throw new Error("D1_ERROR: synthetic test failure with private marker DO_NOT_LOG");
    }
  }
}

export { MemoryD1 };
