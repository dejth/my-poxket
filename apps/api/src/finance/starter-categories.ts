import { sql } from 'drizzle-orm'

import type { Database } from '../database/client.js'
import { categories } from '../database/schema.js'

// Keep each ID stable even if its default label changes in a future release.
export const starterCategories = [
  {
    id: 'a7000000-0000-4000-8000-000000000001',
    direction: 'income',
    name: 'เงินเดือน',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000002',
    direction: 'income',
    name: 'โบนัส',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000003',
    direction: 'income',
    name: 'รายได้เสริม',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000004',
    direction: 'income',
    name: 'ของขวัญและเงินสนับสนุน',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000005',
    direction: 'income',
    name: 'รายรับอื่น ๆ',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000006',
    direction: 'expense',
    name: 'อาหารและเครื่องดื่ม',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000007',
    direction: 'expense',
    name: 'ของใช้ประจำวัน',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000008',
    direction: 'expense',
    name: 'เดินทางและน้ำมัน',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000009',
    direction: 'expense',
    name: 'ที่อยู่อาศัย',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000010',
    direction: 'expense',
    name: 'ค่าน้ำและค่าไฟ',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000011',
    direction: 'expense',
    name: 'โทรศัพท์และอินเทอร์เน็ต',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000012',
    direction: 'expense',
    name: 'สุขภาพและการรักษา',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000013',
    direction: 'expense',
    name: 'ประกัน',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000014',
    direction: 'expense',
    name: 'การศึกษา',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000015',
    direction: 'expense',
    name: 'ช้อปปิ้ง',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000016',
    direction: 'expense',
    name: 'บันเทิงและท่องเที่ยว',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000017',
    direction: 'expense',
    name: 'สมาชิกและบริการรายเดือน',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000018',
    direction: 'expense',
    name: 'ครอบครัวและสัตว์เลี้ยง',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000019',
    direction: 'expense',
    name: 'ของขวัญและบริจาค',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000020',
    direction: 'expense',
    name: 'ค่าธรรมเนียม',
  },
  {
    id: 'a7000000-0000-4000-8000-000000000021',
    direction: 'expense',
    name: 'รายจ่ายอื่น ๆ',
  },
] as const

export async function initializeStarterCategories(database: Database) {
  await database
    .insert(categories)
    .values(
      starterCategories.map((category) => ({
        ...category,
        normalizedName: category.name.toLocaleLowerCase('th-TH'),
      })),
    )
    .onDuplicateKeyUpdate({
      // Preserve both ID/name collisions, including deactivated or renamed rows.
      set: {
        id: sql`${categories.id}`,
        updatedAt: sql`${categories.updatedAt}`,
      },
    })
}
