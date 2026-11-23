import { query } from "@/lib/db";

export type City = { id: number; name: string; slug: string; areas: { id: number; name: string; slug: string }[] };
export type ConditionGroup = { category: string; items: { id: number; name: string; slug: string }[] };

export async function getLocations(): Promise<City[]> {
  const rows = await query<{ id: number; name: string; slug: string; areas: City["areas"] }>(
    `SELECT c.id, c.name, c.slug,
            COALESCE(json_agg(json_build_object('id', a.id, 'name', a.name, 'slug', a.slug) ORDER BY a.name)
                     FILTER (WHERE a.id IS NOT NULL), '[]') AS areas
       FROM cities c
       LEFT JOIN areas a ON a.city_id = c.id AND a.is_active
      WHERE c.is_active
      GROUP BY c.id ORDER BY c.name`,
  );
  return rows;
}

export async function getConditions(): Promise<ConditionGroup[]> {
  const rows = await query<{ category: string; id: number; name: string; slug: string }>(
    `SELECT category, id, name, slug FROM conditions WHERE is_active ORDER BY sort_order, category, name`,
  );
  const order: string[] = [];
  const map = new Map<string, ConditionGroup>();
  for (const r of rows) {
    let g = map.get(r.category);
    if (!g) {
      g = { category: r.category, items: [] };
      map.set(r.category, g);
      order.push(r.category);
    }
    g.items.push({ id: r.id, name: r.name, slug: r.slug });
  }
  return order.map((c) => map.get(c)!);
}
