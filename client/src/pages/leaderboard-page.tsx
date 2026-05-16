import { useEffect, useState } from 'react';
import { Message, Table } from '@arco-design/web-react';
import { api, errMessage } from '../api/http-client';
import type { LeaderboardEntry, PaginatedList } from '../types/api-types';
import { formatMoney } from '../utils/format';
import { PAGE_SIZE, paginationTotal } from '../utils/pagination';

export default function LeaderboardPage() {
  const [list, setList] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedList<LeaderboardEntry>>(
        `/stats/leaderboard?page=${p}&pageSize=${PAGE_SIZE}`,
      );
      setList(res.items);
      setHasMore(res.hasMore);
      setPage(p);
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
  }, []);

  return (
    <>
      <h1 className="page-title">消费排行</h1>
      <Table
        loading={loading}
        rowKey="buyerId"
        data={list}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: paginationTotal(page, PAGE_SIZE, list.length, hasMore),
          showTotal: true,
          onChange: (p) => void load(p),
        }}
        columns={[
          {
            title: '排名',
            render: (_, __, index) => (page - 1) * PAGE_SIZE + index + 1,
          },
          { title: '姓名', dataIndex: 'name' },
          {
            title: '总消费（购买价）',
            dataIndex: 'totalSpent',
            render: (v) => formatMoney(v),
          },
        ]}
      />
    </>
  );
}
