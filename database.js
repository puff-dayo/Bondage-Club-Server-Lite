"use strict";
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

class SqliteDB {
	static async init(dataDir) {
		const SQL = await initSqlJs();
		const dbPath = path.join(dataDir, "bondage_club.db");
		let db;
		if (fs.existsSync(dbPath)) {
			const buffer = fs.readFileSync(dbPath);
			db = new SQL.Database(buffer);
		} else {
			db = new SQL.Database();
		}
		db.run("CREATE TABLE IF NOT EXISTS accounts (AccountName TEXT NOT NULL PRIMARY KEY, MemberNumber INTEGER NOT NULL UNIQUE, Email TEXT NOT NULL DEFAULT '', doc TEXT NOT NULL DEFAULT '{}')");
		db.run("CREATE INDEX IF NOT EXISTS idx_accounts_membernumber ON accounts(MemberNumber)");
		db.run("CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(Email)");
		return new SqliteDB(db, dbPath);
	}

	constructor(db, dbPath) {
		this.db = db;
		this.dbPath = dbPath;
	}

	save() {
		const data = this.db.export();
		fs.writeFileSync(this.dbPath, Buffer.from(data));
	}

	collection(name) {
		return new Collection(this);
	}

	close() {
		this.db.close();
	}
}

class Collection {
	constructor(sqliteDB) {
		this.sqliteDB = sqliteDB;
		this.db = sqliteDB.db;
	}

	findOne(query, options, callback) {
		if (typeof options === 'function') {
			callback = options;
			options = {};
		}
		if (options == null) options = {};
		const run = (cb) => {
			try {
				let row = null;
				if (query.AccountName != null) {
					const stmt = this.db.prepare("SELECT doc, Email FROM accounts WHERE AccountName = ?");
					stmt.bind([query.AccountName]);
					if (stmt.step()) row = stmt.getAsObject();
					stmt.free();
				} else if (query.MemberNumber != null) {
					const stmt = this.db.prepare("SELECT doc, Email FROM accounts WHERE MemberNumber = ?");
					stmt.bind([query.MemberNumber]);
					if (stmt.step()) row = stmt.getAsObject();
					stmt.free();
				}
				if (!row) return cb(null, null);
				const doc = JSON.parse(row.doc);
				doc.Email = row.Email;
				if (options.projection) {
					const result = {};
					for (const key of Object.keys(options.projection)) {
						if (options.projection[key] && doc[key] !== undefined) result[key] = doc[key];
					}
					return cb(null, result);
				}
				cb(null, doc);
			} catch (err) {
				cb(err, null);
			}
		};
		if (typeof callback === 'function') return run(callback);
		return new Promise((resolve, reject) => run((err, doc) => err ? reject(err) : resolve(doc)));
	}

	find(query, options) {
		return new Cursor(this.sqliteDB, query, options);
	}

	insertOne(doc, callback) {
		const run = (cb) => {
			try {
				const email = doc.Email || '';
				this.db.run("INSERT INTO accounts (AccountName, MemberNumber, Email, doc) VALUES (?, ?, ?, ?)", [doc.AccountName, doc.MemberNumber, email, JSON.stringify(doc)]);
				this.sqliteDB.save();
				cb(null, { insertedCount: 1, ops: [doc] });
			} catch (err) {
				cb(err, null);
			}
		};
		if (typeof callback === 'function') return run(callback);
		return new Promise((resolve, reject) => run((err, r) => err ? reject(err) : resolve(r)));
	}

	updateOne(query, update, callback) {
		const run = (cb) => {
			try {
				const accountName = query.AccountName;
				let row = null;
				let stmt;
				if (accountName != null) {
					stmt = this.db.prepare("SELECT doc, Email FROM accounts WHERE AccountName = ?");
					stmt.bind([accountName]);
				} else if (query.MemberNumber != null) {
					stmt = this.db.prepare("SELECT doc, Email FROM accounts WHERE MemberNumber = ?");
					stmt.bind([query.MemberNumber]);
				}
				if (stmt) {
					if (stmt.step()) row = stmt.getAsObject();
					stmt.free();
				}
				if (!row) return cb(new Error('Account not found'), null);
				const doc = JSON.parse(row.doc);
				if (update.$set) {
					Object.assign(doc, update.$set);
				}
				const email = doc.Email || '';
				this.db.run("UPDATE accounts SET doc = ?, Email = ? WHERE AccountName = ?", [JSON.stringify(doc), email, doc.AccountName]);
				this.sqliteDB.save();
				cb(null, { modifiedCount: 1 });
			} catch (err) {
				cb(err, null);
			}
		};
		if (typeof callback === 'function') return run(callback);
		return new Promise((resolve, reject) => run((err, r) => err ? reject(err) : resolve(r)));
	}
}

class Cursor {
	constructor(sqliteDB, query, options) {
		this.sqliteDB = sqliteDB;
		this.db = sqliteDB.db;
		this.query = query;
		this.options = options || {};
		this._sort = null;
		this._limitVal = null;
	}

	sort(s) { this._sort = s; return this; }
	limit(n) { this._limitVal = n; return this; }

	toArray(callback) {
		const run = (cb) => {
			try {
				let rows = [];
				if (this.query.MemberNumber != null && typeof this.query.MemberNumber === 'number') {
					const stmt = this.db.prepare("SELECT doc, Email, AccountName FROM accounts WHERE MemberNumber = ?");
					stmt.bind([this.query.MemberNumber]);
					if (stmt.step()) {
						const row = stmt.getAsObject();
						const doc = JSON.parse(row.doc);
						doc.Email = row.Email;
						doc.AccountName = row.AccountName;
						rows.push(doc);
					}
					stmt.free();
				} else if (this.query.Email != null) {
					const stmt = this.db.prepare("SELECT doc, Email, AccountName FROM accounts WHERE Email = ?");
					stmt.bind([this.query.Email]);
					while (stmt.step()) {
						const row = stmt.getAsObject();
						const doc = JSON.parse(row.doc);
						doc.Email = row.Email;
						doc.AccountName = row.AccountName;
						rows.push(doc);
					}
					stmt.free();
				} else if (this.query.AccountName != null) {
					const stmt = this.db.prepare("SELECT doc, Email FROM accounts WHERE AccountName = ?");
					stmt.bind([this.query.AccountName]);
					if (stmt.step()) {
						const row = stmt.getAsObject();
						const doc = JSON.parse(row.doc);
						doc.Email = row.Email;
						rows.push(doc);
					}
					stmt.free();
				} else if (this.query.MemberNumber && this.query.MemberNumber.$exists != null) {
					const result = this.db.exec("SELECT doc, Email FROM accounts ORDER BY MemberNumber DESC");
					if (result.length > 0) {
						for (const r of result[0].values) {
							const doc = JSON.parse(r[0]);
							doc.Email = r[1];
							rows.push(doc);
						}
					}
					if (this._limitVal) rows = rows.slice(0, this._limitVal);
				}
				if (this._sort && !(typeof this.query.MemberNumber === 'number')) {
					if (this._sort.MemberNumber === -1) {
						rows.sort((a, b) => (b.MemberNumber || 0) - (a.MemberNumber || 0));
					}
				}
				cb(null, rows);
			} catch (err) {
				cb(err, null);
			}
		};
		if (typeof callback === 'function') return run(callback);
		return new Promise((resolve, reject) => run((err, r) => err ? reject(err) : resolve(r)));
	}
}

module.exports = SqliteDB;
