/**
 * Automated Generator for public/all_products.json
 * Fetches all published products from TiDB database and writes to public/all_products.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb } from '../functions/api/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetPath = path.resolve(__dirname, '../public/all_products.json');

export async function generateAllProductsJson() {
  console.log('Generating public/all_products.json from TiDB database...');
  const conn = getDb();
  const products = await conn.execute(
    'SELECT id, name, price, original_price, description, category, subcategory, images, image_url, video_url, is_sale, is_hot, is_new, is_sold_out, is_exclusive, created_at, serial_no FROM products WHERE status = "published" AND is_deleted = 0 ORDER BY created_at DESC'
  );

  const formatted = products.map(p => {
    const tryParse = (val) => {
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return []; }
    };
    return {
      ...p,
      images: tryParse(p.images),
      is_sale: !!p.is_sale,
      is_hot: !!p.is_hot,
      is_new: !!p.is_new,
      is_sold_out: !!p.is_sold_out,
      is_exclusive: !!p.is_exclusive
    };
  });

  fs.writeFileSync(targetPath, JSON.stringify(formatted, null, 2), 'utf-8');
  console.log(`Successfully generated public/all_products.json with ${formatted.length} products.`);
}

if (process.argv[1]?.endsWith('generate-all-products.js')) {
  generateAllProductsJson().catch(console.error);
}
