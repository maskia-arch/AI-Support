const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { database: dbConfig } = require('./env');
const logger = require('../utils/logger');

// Set up PostgreSQL connection pool
const pool = new Pool({
  connectionString: dbConfig.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error(`[DB Pool Error] ${err.message}`);
});

// Auto-Initialisierung des Datenbankschemas beim Start
async function initializeDatabase() {
  try {
    const checkSql = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'settings'
      );
    `;
    const res = await pool.query(checkSql);
    const exists = res.rows[0]?.exists;
    if (!exists) {
      logger.info('[DB Init] Tabelle "settings" nicht gefunden. Initialisiere Datenbank...');
      const schemaPath = path.join(__dirname, '../../supabase/schema_full_v2.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(sql);
        logger.info('[DB Init] Datenbank erfolgreich mit schema_full_v2.sql initialisiert.');
      } else {
        logger.warn(`[DB Init] Schema-Datei nicht gefunden unter: ${schemaPath}`);
      }
    } else {
      logger.info('[DB Init] Datenbank bereits initialisiert.');
    }
  } catch (err) {
    logger.error(`[DB Init] Fehler bei der Datenbank-Initialisierung: ${err.message}`);
  }
}

initializeDatabase().catch(err => {
  logger.error(`[DB Init Background] Fehler: ${err.message}`);
});

// Helper to format JavaScript variables into PostgreSQL-compatible formats.
// Crucial for pgvector: converts number arrays [0.1, 0.2, ...] to vector string format '[0.1,0.2,...]'.
const formatParam = (val) => {
  if (Array.isArray(val)) {
    if (val.length > 0 && typeof val[0] === 'number') {
      return '[' + val.join(',') + ']';
    }
  }
  return val;
};

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.op = 'select'; // select, insert, update, upsert, delete
    this.selectFields = '*';
    this.countOption = null;
    this.isHead = false;
    this.conditions = [];
    this.orderFields = [];
    this.limitVal = null;
    this.offsetVal = null;
    this.singleRow = false;
    this.maybeSingleRow = false;
    this.insertData = null;
    this.updateData = null;
    this.upsertData = null;
    this.onConflictCol = null;
  }

  select(fields = '*', options = {}) {
    this.op = 'select';
    this.selectFields = fields || '*';
    this.countOption = options.count || null;
    this.isHead = options.head || false;
    return this;
  }

  eq(col, val) {
    this.conditions.push({ col, op: '=', val });
    return this;
  }

  neq(col, val) {
    this.conditions.push({ col, op: '!=', val });
    return this;
  }

  gt(col, val) {
    this.conditions.push({ col, op: '>', val });
    return this;
  }

  gte(col, val) {
    this.conditions.push({ col, op: '>=', val });
    return this;
  }

  lt(col, val) {
    this.conditions.push({ col, op: '<', val });
    return this;
  }

  lte(col, val) {
    this.conditions.push({ col, op: '<=', val });
    return this;
  }

  is(col, val) {
    this.conditions.push({ col, op: 'IS', val });
    return this;
  }

  not(col, op, val) {
    this.conditions.push({ col, op: 'NOT', subop: op, val });
    return this;
  }

  in(col, arr) {
    this.conditions.push({ col, op: 'IN', val: arr });
    return this;
  }

  or(conditionsString) {
    this.conditions.push({ op: 'OR', raw: conditionsString });
    return this;
  }

  ilike(col, val) {
    this.conditions.push({ col, op: 'ILIKE', val });
    return this;
  }

  order(col, options = {}) {
    const direction = options.ascending === false ? 'DESC' : 'ASC';
    this.orderFields.push(`"${col}" ${direction}`);
    return this;
  }

  limit(val) {
    this.limitVal = parseInt(val, 10);
    return this;
  }

  range(start, end) {
    this.limitVal = parseInt(end, 10) - parseInt(start, 10) + 1;
    this.offsetVal = parseInt(start, 10);
    return this;
  }

  single() {
    this.singleRow = true;
    return this;
  }

  maybeSingle() {
    this.maybeSingleRow = true;
    return this;
  }

  insert(data) {
    this.op = 'insert';
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data) {
    this.op = 'update';
    this.updateData = data;
    return this;
  }

  upsert(data, options = {}) {
    this.op = 'upsert';
    this.upsertData = Array.isArray(data) ? data : [data];
    this.onConflictCol = options.onConflict || null;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute() {
    let sql = '';
    const params = [];

    const compileCondition = (cond) => {
      if (cond.op === 'OR') {
        const orParts = cond.raw.split(',');
        const compiledParts = [];
        for (const part of orParts) {
          const subParts = part.trim().split('.');
          if (subParts.length >= 3) {
            const col = subParts[0];
            const op = subParts[1];
            let val = subParts.slice(2).join('.');
            
            if (val === 'null') val = null;
            else if (val === 'true') val = true;
            else if (val === 'false') val = false;

            if (op === 'eq') {
              if (val === null) {
                compiledParts.push(`"${col}" IS NULL`);
              } else {
                params.push(formatParam(val));
                compiledParts.push(`"${col}" = $${params.length}`);
              }
            } else if (op === 'neq') {
              if (val === null) {
                compiledParts.push(`"${col}" IS NOT NULL`);
              } else {
                params.push(formatParam(val));
                compiledParts.push(`"${col}" != $${params.length}`);
              }
            }
          }
        }
        return compiledParts.length > 0 ? `(${compiledParts.join(' OR ')})` : 'TRUE';
      }

      const { col, op, val, subop } = cond;
      if (op === '=') {
        if (val === null) return `"${col}" IS NULL`;
        params.push(formatParam(val));
        return `"${col}" = $${params.length}`;
      }
      if (op === '!=') {
        if (val === null) return `"${col}" IS NOT NULL`;
        params.push(formatParam(val));
        return `"${col}" != $${params.length}`;
      }
      if (op === '>') {
        params.push(formatParam(val));
        return `"${col}" > $${params.length}`;
      }
      if (op === '>=') {
        params.push(formatParam(val));
        return `"${col}" >= $${params.length}`;
      }
      if (op === '<') {
        params.push(formatParam(val));
        return `"${col}" < $${params.length}`;
      }
      if (op === '<=') {
        params.push(formatParam(val));
        return `"${col}" <= $${params.length}`;
      }
      if (op === 'IS') {
        if (val === null) return `"${col}" IS NULL`;
        params.push(formatParam(val));
        return `"${col}" IS $${params.length}`;
      }
      if (op === 'NOT') {
        if (subop === 'is' && val === null) return `"${col}" IS NOT NULL`;
        params.push(formatParam(val));
        return `NOT ("${col}" ${subop} $${params.length})`;
      }
      if (op === 'IN') {
        if (!Array.isArray(val) || val.length === 0) return 'FALSE';
        const placeholders = val.map(v => {
          params.push(formatParam(v));
          return `$${params.length}`;
        }).join(', ');
        return `"${col}" IN (${placeholders})`;
      }
      if (op === 'ILIKE') {
        params.push(formatParam(val));
        return `"${col}" ILIKE $${params.length}`;
      }
      return 'TRUE';
    };

    let countEnabled = false;

    if (this.op === 'select') {
      let fieldsSql = this.selectFields;
      if (this.countOption === 'exact' && !this.isHead) {
        fieldsSql = `${this.selectFields}, COUNT(*) OVER() AS __full_count`;
        countEnabled = true;
      } else if (this.isHead) {
        fieldsSql = 'COUNT(*) AS __full_count';
        countEnabled = true;
      }

      sql = `SELECT ${fieldsSql} FROM "${this.table}"`;
      const compiledConds = this.conditions.map(compileCondition);
      if (compiledConds.length > 0) {
        sql += ` WHERE ${compiledConds.join(' AND ')}`;
      }
      if (this.orderFields.length > 0) {
        sql += ` ORDER BY ${this.orderFields.join(', ')}`;
      }
      if (this.limitVal !== null) {
        sql += ` LIMIT ${this.limitVal}`;
      }
      if (this.offsetVal !== null) {
        sql += ` OFFSET ${this.offsetVal}`;
      }
    } 
    else if (this.op === 'insert') {
      if (!this.insertData || this.insertData.length === 0) {
        return { data: [], error: null, count: 0 };
      }
      const keys = Array.from(new Set(this.insertData.reduce((acc, row) => acc.concat(Object.keys(row)), [])));
      const columns = keys.map(k => `"${k}"`).join(', ');
      
      const valuePlaceholders = [];
      for (const row of this.insertData) {
        const rowPlaceholders = [];
        for (const key of keys) {
          const val = row[key] !== undefined ? row[key] : null;
          params.push(formatParam(val));
          rowPlaceholders.push(`$${params.length}`);
        }
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      sql = `INSERT INTO "${this.table}" (${columns}) VALUES ${valuePlaceholders.join(', ')} RETURNING *`;
    } 
    else if (this.op === 'update') {
      if (!this.updateData || Object.keys(this.updateData).length === 0) {
        return { data: [], error: null, count: 0 };
      }
      const setClauses = [];
      for (const [key, val] of Object.entries(this.updateData)) {
        params.push(formatParam(val));
        setClauses.push(`"${key}" = $${params.length}`);
      }

      sql = `UPDATE "${this.table}" SET ${setClauses.join(', ')}`;
      const compiledConds = this.conditions.map(compileCondition);
      if (compiledConds.length > 0) {
        sql += ` WHERE ${compiledConds.join(' AND ')}`;
      }
      sql += ' RETURNING *';
    } 
    else if (this.op === 'upsert') {
      if (!this.upsertData || this.upsertData.length === 0) {
        return { data: [], error: null, count: 0 };
      }
      const keys = Array.from(new Set(this.upsertData.reduce((acc, row) => acc.concat(Object.keys(row)), [])));
      const columns = keys.map(k => `"${k}"`).join(', ');
      
      const valuePlaceholders = [];
      for (const row of this.upsertData) {
        const rowPlaceholders = [];
        for (const key of keys) {
          const val = row[key] !== undefined ? row[key] : null;
          params.push(formatParam(val));
          rowPlaceholders.push(`$${params.length}`);
        }
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      const conflictTarget = this.onConflictCol || (this.table === 'widget_visitors' ? 'chat_id' : 'id');
      const updateKeys = keys.filter(k => k !== conflictTarget);
      const doUpdateSet = updateKeys.map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');

      sql = `INSERT INTO "${this.table}" (${columns}) VALUES ${valuePlaceholders.join(', ')}`;
      if (doUpdateSet) {
        sql += ` ON CONFLICT ("${conflictTarget}") DO UPDATE SET ${doUpdateSet}`;
      } else {
        sql += ` ON CONFLICT ("${conflictTarget}") DO NOTHING`;
      }
      sql += ' RETURNING *';
    } 
    else if (this.op === 'delete') {
      sql = `DELETE FROM "${this.table}"`;
      const compiledConds = this.conditions.map(compileCondition);
      if (compiledConds.length > 0) {
        sql += ` WHERE ${compiledConds.join(' AND ')}`;
      }
      sql += ' RETURNING *';
    }

    try {
      const result = await pool.query(sql, params);
      let data = result.rows;
      let count = null;

      if (countEnabled && data.length > 0) {
        if (this.isHead) {
          count = parseInt(data[0].__full_count, 10);
          data = [];
        } else {
          count = parseInt(data[0].__full_count, 10);
          data.forEach(row => delete row.__full_count);
        }
      } else if (countEnabled) {
        count = 0;
      }

      if (this.singleRow) {
        if (data.length === 0) {
          return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count };
        }
        data = data[0];
      } else if (this.maybeSingleRow) {
        data = data.length > 0 ? data[0] : null;
      }

      return { data, error: null, count };
    } catch (err) {
      logger.error(`[DB Adapter Error] SQL: ${sql} | Msg: ${err.message}`);
      return { data: null, error: err, count: null };
    }
  }
}

const supabase = {
  from: (table) => new QueryBuilder(table),

  async rpc(fnName, params = {}) {
    let sql = '';
    const values = [];

    if (fnName === 'match_knowledge') {
      sql = `SELECT * FROM match_knowledge($1, $2, $3)`;
      values.push(formatParam(params.query_embedding), formatParam(params.match_threshold), formatParam(params.match_count));
    } else if (fnName === 'update_user_reputation') {
      sql = `SELECT update_user_reputation($1, $2, $3, $4)`;
      values.push(formatParam(params.p_channel_id), formatParam(params.p_user_id), formatParam(params.p_username), formatParam(params.p_delta));
    } else {
      const keys = Object.keys(params);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      sql = `SELECT * FROM ${fnName}(${placeholders})`;
      keys.forEach(k => values.push(formatParam(params[k])));
    }

    try {
      const res = await pool.query(sql, values);
      return { data: res.rows, error: null };
    } catch (err) {
      logger.error(`[DB Adapter RPC Error] RPC: ${fnName} | Msg: ${err.message}`);
      return { data: null, error: err };
    }
  }
};

module.exports = supabase;
