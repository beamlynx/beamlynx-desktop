// The sample database: a small online shop that sells outdoor gear, for
// someone who wants to try Beamlynx before connecting a database of their own.
// The first-run screen offers it, and so does Settings -> Connections while
// there are no connections.
//
// It is a SQLite file in the app's data folder, built the first time someone
// asks for it. It is not shipped in the app: the app bundle is read-only, and
// people may change rows in the sample to try writes.
//
// The rows come from a seeded random generator, so every build has the same
// rows. Dates count back from the moment the file is built, so a new sample
// has recent orders. The file is kept once built, so its dates then age.
//
// No `electron` import: tests build the file in plain Node.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const SAMPLE_DATABASE_FILE = 'sample-shop.db';
export const SAMPLE_DATABASE_LABEL = 'Sample shop';

const SCHEMA = `
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id)
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  price REAL NOT NULL,
  stock INTEGER NOT NULL,
  attributes JSON NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  newsletter BOOLEAN NOT NULL,
  signed_up_at DATETIME NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL,
  ordered_at DATETIME NOT NULL,
  shipped_at DATETIME,
  total REAL NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  rating INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  manager_id INTEGER REFERENCES employees(id),
  hired_at DATETIME NOT NULL
);

CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_id INTEGER REFERENCES orders(id),
  assigned_to INTEGER REFERENCES employees(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at DATETIME NOT NULL,
  closed_at DATETIME
);
`;

// [name, parent] -- a parent comes before its children.
const CATEGORIES: [string, string | null][] = [
  ['Camping', null],
  ['Tents', 'Camping'],
  ['Sleeping bags', 'Camping'],
  ['Cooking', 'Camping'],
  ['Hiking', null],
  ['Backpacks', 'Hiking'],
  ['Footwear', 'Hiking'],
  ['Navigation', 'Hiking'],
  ['Clothing', null],
  ['Jackets', 'Clothing'],
  ['Base layers', 'Clothing'],
  ['Climbing', null],
  ['Ropes', 'Climbing'],
  ['Harnesses', 'Climbing'],
];

// [name, category, price, colours, tags]
const PRODUCTS: [string, string, number, string[], string[]][] = [
  ['Ridge 2 tent', 'Tents', 289, ['green', 'orange'], ['two-person', 'freestanding']],
  ['Ridge 3 tent', 'Tents', 349, ['green'], ['three-person', 'freestanding']],
  ['Featherlite 1 tent', 'Tents', 419, ['grey'], ['one-person', 'ultralight']],
  ['Basecamp 6 tent', 'Tents', 599, ['sand'], ['six-person', 'family']],
  ['Bivy shelter', 'Tents', 149, ['olive'], ['one-person', 'ultralight', 'waterproof']],
  ['Summit -10 sleeping bag', 'Sleeping bags', 259, ['red'], ['down', 'winter']],
  ['Meadow 5 sleeping bag', 'Sleeping bags', 119, ['blue'], ['synthetic', 'three-season']],
  ['Cocoon liner', 'Sleeping bags', 39, ['grey'], ['silk']],
  ['Kids sleeping bag', 'Sleeping bags', 69, ['yellow', 'blue'], ['synthetic', 'kids']],
  ['Pocket stove', 'Cooking', 45, ['silver'], ['gas', 'ultralight']],
  ['Titan pot set', 'Cooking', 79, ['silver'], ['titanium']],
  ['Folding spork', 'Cooking', 9, ['orange', 'green', 'blue'], ['titanium']],
  ['Water filter', 'Cooking', 54, ['blue'], ['filter']],
  ['Gas canister 230 g', 'Cooking', 7, ['blue'], ['gas']],
  ['Trail 28 backpack', 'Backpacks', 99, ['black', 'teal'], ['daypack']],
  ['Trail 45 backpack', 'Backpacks', 179, ['black', 'red'], ['multi-day']],
  ['Expedition 70 backpack', 'Backpacks', 279, ['grey'], ['multi-day', 'expedition']],
  ['Hydration pack', 'Backpacks', 69, ['blue'], ['daypack', 'running']],
  ['Granite hiking boots', 'Footwear', 199, ['brown'], ['waterproof', 'leather']],
  ['Trailrunner shoes', 'Footwear', 139, ['blue', 'orange'], ['running']],
  ['Approach shoes', 'Footwear', 159, ['grey'], ['climbing']],
  ['Merino hiking socks', 'Footwear', 19, ['grey', 'green'], ['merino']],
  ['Gaiters', 'Footwear', 39, ['black'], ['waterproof']],
  ['Baseplate compass', 'Navigation', 35, ['clear'], ['analog']],
  ['GPS watch', 'Navigation', 349, ['black'], ['electronic', 'gps']],
  ['Headlamp 400', 'Navigation', 49, ['black', 'orange'], ['electronic', 'rechargeable']],
  ['Map case', 'Navigation', 22, ['clear'], ['waterproof']],
  ['Storm shell jacket', 'Jackets', 329, ['red', 'blue', 'black'], ['waterproof', 'breathable']],
  ['Down puffer jacket', 'Jackets', 249, ['black', 'olive'], ['down', 'winter']],
  ['Fleece midlayer', 'Jackets', 89, ['grey', 'blue'], ['fleece']],
  ['Wind shell', 'Jackets', 119, ['yellow'], ['ultralight']],
  ['Merino base top', 'Base layers', 79, ['black', 'grey'], ['merino']],
  ['Merino base leggings', 'Base layers', 69, ['black'], ['merino']],
  ['Synthetic tee', 'Base layers', 35, ['blue', 'red', 'white'], ['quick-dry']],
  ['Dynamic rope 60 m', 'Ropes', 189, ['blue', 'green'], ['dynamic']],
  ['Dynamic rope 70 m', 'Ropes', 219, ['red'], ['dynamic']],
  ['Static rope 40 m', 'Ropes', 139, ['white'], ['static']],
  ['Sport harness', 'Harnesses', 69, ['black'], ['sport']],
  ['Alpine harness', 'Harnesses', 89, ['orange'], ['alpine', 'ultralight']],
  ['Kids full-body harness', 'Harnesses', 59, ['green'], ['kids']],
];

const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Lucas', 'Mia', 'Elias', 'Sofia', 'Oscar',
  'Freja', 'William', 'Ida', 'Karl', 'Aisha', 'Omar', 'Yuki', 'Hiro', 'Priya', 'Arjun',
  'Chloe', 'Mateo', 'Lea', 'Jonas', 'Nora', 'Felix', 'Amara', 'Kofi', 'Ingrid', 'Lars',
  'Zara', 'Ali', 'Mei', 'Chen', 'Lucia', 'Diego', 'Hannah', 'Ben', 'Sara', 'Malik',
];

const LAST_NAMES = [
  'Hansen', 'Jensen', 'Nielsen', 'Andersson', 'Johansson', 'Berg', 'Smith', 'Brown', 'Wilson', 'Taylor',
  'Müller', 'Schmidt', 'Weber', 'Dubois', 'Martin', 'Rossi', 'Bianchi', 'García', 'López', 'Silva',
  'Khan', 'Ahmed', 'Patel', 'Sharma', 'Tanaka', 'Sato', 'Kim', 'Park', 'Wang', 'Li',
  'Okafor', 'Mensah', 'Novak', 'Kowalski', 'Virtanen', 'Murphy',
];

// [city, country]
const CITIES: [string, string][] = [
  ['Copenhagen', 'Denmark'],
  ['Aarhus', 'Denmark'],
  ['Stockholm', 'Sweden'],
  ['Gothenburg', 'Sweden'],
  ['Oslo', 'Norway'],
  ['Bergen', 'Norway'],
  ['Helsinki', 'Finland'],
  ['Berlin', 'Germany'],
  ['Munich', 'Germany'],
  ['Amsterdam', 'Netherlands'],
  ['London', 'United Kingdom'],
  ['Edinburgh', 'United Kingdom'],
  ['Paris', 'France'],
  ['Lyon', 'France'],
  ['Zurich', 'Switzerland'],
  ['Vienna', 'Austria'],
  ['Milan', 'Italy'],
  ['Madrid', 'Spain'],
  ['Denver', 'United States'],
  ['Seattle', 'United States'],
  ['Vancouver', 'Canada'],
];

// [name, role, manager's index in this list]
const EMPLOYEES: [string, string, number | null][] = [
  ['Signe Holm', 'Head of support', null],
  ['Rasmus Lund', 'Support lead', 0],
  ['Nadia Karimi', 'Support lead', 0],
  ['Tobias Krogh', 'Support agent', 1],
  ['Elif Demir', 'Support agent', 1],
  ['Jakob Friis', 'Support agent', 1],
  ['Maja Eriksen', 'Support agent', 2],
  ['Samuel Osei', 'Support agent', 2],
  ['Clara Vogt', 'Support agent', 2],
];

const TICKET_SUBJECTS = [
  'Where is my order?',
  'Wrong size delivered',
  'Item arrived damaged',
  'Request a refund',
  'Change delivery address',
  'Question about sizing',
  'Missing item in parcel',
  'Discount code does not work',
  'Warranty claim',
  'Cancel my order',
];

const REVIEW_TITLES: Record<number, string[]> = {
  1: ['Broke on the first trip', 'Not as described', 'Would not buy again'],
  2: ['Disappointing', 'Runs small', 'Okay for the price, barely'],
  3: ['Does the job', 'Fine, nothing special', 'Decent but heavy'],
  4: ['Very good', 'Solid gear', 'Happy with it', 'Great value'],
  5: ['Excellent', 'Best purchase this year', 'Perfect for the mountains', 'Love it'],
};

// mulberry32: small, fast, and the same sequence for the same seed.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;

// SQLite's own DATETIME text form, in UTC: 2026-11-22 14:03:51.
function sqlDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Writes the sample database to `file`, replacing any file there. The rows
 * are the same on every build; only the dates move with `now`.
 */
export function buildSampleDatabase(file: string, now: number = Date.now()): void {
  const random = seededRandom(20261122);
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  // Weighted towards recent dates: a shop that is growing.
  const daysAgo = (maxDays: number) => Math.floor(maxDays * Math.pow(random(), 1.6));

  mkdirSync(dirname(file), { recursive: true });
  // Built next to the target, then moved in place: a half-built file is
  // never left where the app would connect to it.
  const temp = `${file}.building`;
  rmSync(temp, { force: true });
  const db = new DatabaseSync(temp);
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    db.exec('BEGIN');

    const categoryId = new Map<string, number>();
    const insertCategory = db.prepare('INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)');
    CATEGORIES.forEach(([name, parent], i) => {
      categoryId.set(name, i + 1);
      insertCategory.run(i + 1, name, parent ? (categoryId.get(parent) ?? null) : null);
    });

    const insertProduct = db.prepare(
      'INSERT INTO products (id, category_id, name, sku, price, stock, attributes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const productPrice: number[] = [];
    PRODUCTS.forEach(([name, category, price, colours, tags], i) => {
      const id = i + 1;
      productPrice[id] = price;
      const attributes = {
        colors: colours,
        weight_g: int(1, 40) * 50,
        tags,
        ...(random() < 0.3 ? { discontinued: true } : {}),
      };
      const sku = `${category.slice(0, 3).toUpperCase()}-${String(1000 + id * 7)}`;
      // Some products are out of stock: a where: on stock = 0 finds them.
      const stock = random() < 0.12 ? 0 : int(2, 180);
      insertProduct.run(
        id,
        categoryId.get(category) ?? null,
        name,
        sku,
        price,
        stock,
        JSON.stringify(attributes),
        sqlDate(now - (700 + int(0, 300)) * DAY),
      );
    });

    const CUSTOMERS = 240;
    const insertCustomer = db.prepare(
      'INSERT INTO customers (id, first_name, last_name, email, city, country, newsletter, signed_up_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const signedUp: number[] = [];
    for (let id = 1; id <= CUSTOMERS; id++) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const [city, country] = pick(CITIES);
      const local = `${first}.${last}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z.]/g, '');
      const at = now - daysAgo(730) * DAY - int(0, DAY - 1);
      signedUp[id] = at;
      insertCustomer.run(id, first, last, `${local}${id}@example.com`, city, country, random() < 0.45 ? 1 : 0, sqlDate(at));
    }

    const insertOrder = db.prepare(
      'INSERT INTO orders (id, customer_id, status, ordered_at, shipped_at, total) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertItem = db.prepare(
      'INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
    );
    const orderCustomer: number[] = [];
    const orderTime: number[] = [];
    let orderId = 0;
    let itemId = 0;
    for (let customer = 1; customer <= CUSTOMERS; customer++) {
      // A few customers order a lot, many order once or twice, and some never.
      const r = random();
      const count = r < 0.15 ? 0 : r < 0.6 ? int(1, 2) : r < 0.9 ? int(3, 6) : int(8, 16);
      const sinceSignup = Math.max(1, Math.floor((now - signedUp[customer]) / DAY));
      for (let n = 0; n < count; n++) {
        orderId++;
        orderCustomer[orderId] = customer;
        const age = daysAgo(sinceSignup);
        const orderedAt = now - age * DAY - int(0, DAY - 1);
        orderTime[orderId] = orderedAt;
        let status: string;
        if (age < 2) status = pick(['pending', 'paid']);
        else if (age < 6) status = pick(['paid', 'shipped', 'shipped']);
        else {
          const s = random();
          status = s < 0.84 ? 'delivered' : s < 0.94 ? 'cancelled' : 'refunded';
        }
        const shippedAt =
          status === 'shipped' || status === 'delivered' || status === 'refunded'
            ? sqlDate(orderedAt + int(1, 4) * DAY)
            : null;

        let total = 0;
        const lines = int(1, 4);
        const seen = new Set<number>();
        const items: [number, number, number][] = [];
        for (let l = 0; l < lines; l++) {
          const product = int(1, PRODUCTS.length);
          if (seen.has(product)) continue;
          seen.add(product);
          const quantity = random() < 0.8 ? 1 : int(2, 4);
          // Sometimes on sale: the price paid is lower than the list price.
          const unitPrice = random() < 0.2 ? round2(productPrice[product] * 0.8) : productPrice[product];
          total += quantity * unitPrice;
          items.push([product, quantity, unitPrice]);
        }
        insertOrder.run(orderId, customer, status, sqlDate(orderedAt), shippedAt, round2(total));
        for (const [product, quantity, unitPrice] of items) {
          itemId++;
          insertItem.run(itemId, orderId, product, quantity, unitPrice);
        }
      }
    }

    // Reviews, from customers who ordered the product.
    const insertReview = db.prepare(
      'INSERT INTO reviews (id, product_id, customer_id, rating, title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const delivered = db
      .prepare(
        `SELECT o.customer_id AS customer_id, i.product_id AS product_id, o.ordered_at AS ordered_at
         FROM orders o JOIN order_items i ON i.order_id = o.id
         WHERE o.status = 'delivered' ORDER BY i.id`,
      )
      .all() as { customer_id: number; product_id: number; ordered_at: string }[];
    let reviewId = 0;
    const reviewed = new Set<string>();
    for (const row of delivered) {
      const key = `${row.customer_id}:${row.product_id}`;
      if (reviewed.has(key) || random() > 0.3) continue;
      reviewed.add(key);
      reviewId++;
      const r = random();
      const rating = r < 0.05 ? 1 : r < 0.12 ? 2 : r < 0.28 ? 3 : r < 0.6 ? 4 : 5;
      const ordered = Date.parse(row.ordered_at.replace(' ', 'T') + 'Z');
      const createdAt = Math.min(now, ordered + int(5, 40) * DAY);
      insertReview.run(reviewId, row.product_id, row.customer_id, rating, pick(REVIEW_TITLES[rating]), sqlDate(createdAt));
    }

    const insertEmployee = db.prepare(
      'INSERT INTO employees (id, name, role, manager_id, hired_at) VALUES (?, ?, ?, ?, ?)',
    );
    EMPLOYEES.forEach(([name, role, manager], i) => {
      insertEmployee.run(i + 1, name, role, manager === null ? null : manager + 1, sqlDate(now - int(200, 1500) * DAY));
    });

    const insertTicket = db.prepare(
      'INSERT INTO support_tickets (id, customer_id, order_id, assigned_to, subject, status, opened_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const TICKETS = 140;
    for (let id = 1; id <= TICKETS; id++) {
      // Most tickets are about an order; some are general questions.
      const order = random() < 0.8 ? int(1, orderId) : null;
      const customer = order ? orderCustomer[order] : int(1, CUSTOMERS);
      // A ticket about an order opens after the order was placed.
      const earliest = order ? orderTime[order] : now - 365 * DAY;
      const openedAt = earliest + Math.floor(random() * (now - earliest));
      const age = Math.floor((now - openedAt) / DAY);
      const status = age < 3 ? pick(['open', 'open', 'waiting']) : random() < 0.92 ? 'closed' : 'waiting';
      // New tickets wait for someone to pick them up.
      const assignedTo = status === 'open' && random() < 0.5 ? null : int(4, EMPLOYEES.length);
      const closedAt = status === 'closed' ? sqlDate(openedAt + int(1, 72) * 60 * 60 * 1000) : null;
      insertTicket.run(id, customer, order, assignedTo, pick(TICKET_SUBJECTS), status, sqlDate(openedAt), closedAt);
    }

    db.exec('COMMIT');
  } catch (e) {
    db.close();
    rmSync(temp, { force: true });
    throw e;
  }
  db.close();
  renameSync(temp, file);
}

/**
 * The sample database's path in `dataDir`. Builds it when it isn't there
 * yet. An existing file is kept as it is, with any rows the person changed.
 */
export function ensureSampleDatabase(dataDir: string): string {
  const file = join(dataDir, SAMPLE_DATABASE_FILE);
  if (!existsSync(file)) buildSampleDatabase(file);
  return file;
}
