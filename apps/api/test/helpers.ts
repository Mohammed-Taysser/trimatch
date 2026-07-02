// Paginated lists mean a freshly-created row is not necessarily on page 1 —
// test helpers walk pages until the predicate matches or pages run out.
export async function findAcrossPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; totalPages: number }>,
  predicate: (item: T) => boolean,
): Promise<T | undefined> {
  for (let page = 1; ; page++) {
    const { items, totalPages } = await fetchPage(page);
    const hit = items.find(predicate);
    if (hit) return hit;
    if (page >= totalPages) return undefined;
  }
}
