import { useEffect, useState } from 'react';
import { InputNumber, Message, Table } from '@arco-design/web-react';
import { api, errMessage } from '../api/http-client';
import type { LeaderboardEntry } from '../types/api-types';
import { formatMoney } from '../utils/format';

export default function LeaderboardPage() {
  const [list, setList] = useState<LeaderboardEntry[]>([]);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setList(await api.get<LeaderboardEntry[]>(`/stats/leaderboard?limit=${limit}`));
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [limit]);

  return (
    <>
      <h1 className="page-title">消费排行</h1>
      <div style={{ marginBottom: 16 }}>
        <span style={{ marginRight: 8 }}>显示条数</span>
        <InputNumber min={1} max={100} value={limit} onChange={(v) => setLimit(v ?? 20)} />
      </div>
      <Table
        loading={loading}
        rowKey="buyerId"
        data={list}
        columns={[
          { title: '排名', render: (_, __, index) => index + 1 },
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
