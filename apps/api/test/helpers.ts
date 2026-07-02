import { InboxSchema } from '@trimatch/shared';
import request from 'supertest';

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

// Matrix chains (FR-501) create one step per approver — approve a requisition
// through every provided approver's inbox until its chain is exhausted.
export async function approveAcrossChain(
  server: unknown,
  approverTokens: string[],
  reqId: string,
): Promise<void> {
  for (const token of approverTokens) {
    const item = await findAcrossPages(
      async (page) => {
        const res = await request(server as Parameters<typeof request>[0])
          .get(`/api/v1/approvals/inbox?page=${page}&pageSize=100`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        return {
          items: InboxSchema.parse(res.body.data),
          totalPages: res.body.meta.totalPages as number,
        };
      },
      (i) => i.requisition.id === reqId,
    );
    if (item) {
      await request(server as Parameters<typeof request>[0])
        .post(`/api/v1/approvals/steps/${item.stepId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    }
  }
}
